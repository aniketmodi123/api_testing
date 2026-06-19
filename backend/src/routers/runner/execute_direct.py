"""
What this file does: Exposes POST /api/execute-direct and /api/execute-with-validation for firing external HTTP requests with variable resolution, inherited folder headers, and optional assertion evaluation.
"""

from typing import Dict, Any
from fastapi import APIRouter, Depends, Header as FastAPIHeader, HTTPException
import httpx, time, json

from schema import ApiExecuteRequest
from routers.runner.validator import evaluate_expect

from utils import (
    ExceptionHandler,
    create_response,
    resolve_variables,
    merge_scopes,
    handle_http_error,
    get_environment_variables,
    logs,
)
from http_client import get_http_client, OUTBOUND_VERIFY_TLS
from ssrf import assert_safe_url
from routers.variables.global_variables import get_global_variables_for_user
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from common_querys import get_user_by_username, verify_node_ownership, get_headers, resolve_auth, build_scope_chain
from config import get_db
from models import Environment, Node
from auth_strategies import apply_auth_async

def resolve_docker_url(url: str) -> str:
    """What it does: Replace 'localhost' with 'host.docker.internal' so the container can reach the host machine."""
    if 'localhost' in url:
        return url.replace('localhost', 'host.docker.internal')
    return url


async def send_request(
    *,
    method: str,
    url: str,
    headers: Dict[str, Any],
    params: Dict[str, Any],
    body: Any,
    body_type: str = "JSON",
    timeout: float = 30.0,
) -> Dict[str, Any]:
    """
    What it does: Fire an outbound HTTP request with SSRF guard and Docker URL rewriting; return a dict with status_code, headers, text, json, and execution_time.
    Args:
        method: HTTP verb (GET, POST, etc.).
        url: Fully resolved request URL.
        headers: Final merged request headers.
        params: Resolved query parameters; appended to the URL.
        body: Request body — dict, list, or str; ``None`` for body-less requests.
        body_type: ``"JSON"`` (default) sends as JSON; ``"FORM-DATA"`` or ``"URL-ENCODED"`` sends as form.
        timeout: Request timeout in seconds; defaults to 30.
    Returns:
        dict: ``{status_code, headers, text, json, execution_time}`` — caller formats for its response shape.
    Raises:
        httpx.ConnectError: When the target is unreachable.
        httpx.TimeoutException: When the request exceeds timeout.
        ValueError: When assert_safe_url rejects the URL (SSRF guard).
    """
    # Build final URL with query params
    final_url = url
    if params:
        param_string = "&".join(f"{k}={v}" for k, v in params.items() if v is not None)
        if param_string:
            separator = "&" if "?" in final_url else "?"
            final_url = f"{final_url}{separator}{param_string}"

    request_data: Dict[str, Any] = {
        "method": method.upper(),
        "url": resolve_docker_url(final_url),
        "headers": headers,
    }

    body_type_upper = (body_type or "JSON").upper()
    if method.upper() != "GET" and body is not None:
        if body_type_upper in ("FORM-DATA", "URL-ENCODED"):
            if isinstance(body, str):
                request_data["content"] = body.encode("utf-8")
                headers["Content-Type"] = "application/x-www-form-urlencoded"
            else:
                request_data["data"] = body
        elif isinstance(body, (dict, list)):
            request_data["json"] = body
        else:
            request_data["content"] = str(body)

    assert_safe_url(request_data["url"])

    start = time.time()
    client = get_http_client()
    response = await client.request(**request_data)
    elapsed = time.time() - start

    response_json = None
    try:
        response_json = response.json()
    except Exception:
        pass

    return {
        "status_code": response.status_code,
        "headers": dict(response.headers),
        "text": response.text,
        "json": response_json,
        "execution_time": round(elapsed, 3),
        "resolved_url": final_url,
    }


router = APIRouter()


async def test_connectivity(url: str) -> Dict[str, Any]:
    """
    What it does: Probe the URL and its localhost/Docker variants to identify which form is reachable from this container.
    Returns:
        dict[str, Any]: Mapping of tested URL → result dict with status ("success"/"failed"), status_code when successful, and error message when failed.
    """
    results = {}

    # Test different URL variations
    test_urls = [
        url,
        url.replace('localhost', '127.0.0.1'),
        url.replace('localhost', 'host.docker.internal') if 'localhost' in url else None
    ]
    test_urls = [u for u in test_urls if u is not None]

    for test_url in test_urls:
        try:
            client = get_http_client()
            response = await client.get(test_url, timeout=5.0)
            results[test_url] = {
                "status": "success",
                "status_code": response.status_code,
                "response_time": "< 5s"
            }
        except Exception as e:
            results[test_url] = {
                "status": "failed",
                "error": str(e)
            }

    return results


@router.post("/test-connectivity")
async def test_url_connectivity(
    url: str,
    x_username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db)
):
    """POST /api/test-connectivity — probe the URL and its localhost/Docker variants; return reachability results for each form."""
    try:
        user = await get_user_by_username(db, x_username)
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        results = await test_connectivity(url)

        return create_response(
            response_code=200,
            data={
                "url_tested": url,
                "connectivity_results": results,
                "recommendation": "Use the URL that shows 'success' status"
            }
        )
    except Exception as e:
        return handle_http_error(e, url=url, method="GET", headers={})




@router.post("/execute-direct")
async def execute_api_direct(
    request: ApiExecuteRequest,
    username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db)
):
    """POST /api/execute-direct — resolve variables (global → env), merge folder headers, and fire the external HTTP request; return response with timing and resolved metadata. When file_id is None (ephemeral/scratch request), skips DB scope chain and auth injection — fires with only the variables and headers supplied in the request body."""
    try:
        # Verify user permissions
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        if request.file_id is not None:
            # Saved request: verify ownership, load scope chain + folder headers + auth
            if not await verify_node_ownership(db, request.file_id, user.id):
                return create_response(400, error_message="Access denied")

            file_query = select(Node).where(Node.id == request.file_id)
            file_result = await db.execute(file_query)
            file_node = file_result.scalar_one_or_none()
            if not file_node:
                return create_response(206, error_message="File not found")

            workspace_id = file_node.workspace_id
            merged_variables = await build_scope_chain(
                db, file_id=request.file_id, username=username, workspace_id=workspace_id
            )
            _, __, ___, merge_result = await get_headers(db, request.file_id)
            merged_headers = merge_result.get("merged_headers", {})
        else:
            # Ephemeral/scratch request: no DB lookup, no scope chain, no folder headers
            merged_variables = {}
            merged_headers = {}

        # Resolve variables in all request parts
        resolved_url = resolve_variables(request.url, merged_variables)
        resolved_headers = resolve_variables(merged_headers, merged_variables)
        resolved_params = resolve_variables(request.params, merged_variables)
        resolved_body = None

        if request.body is not None:
            if isinstance(request.body, (str, dict, list)):
                resolved_body = resolve_variables(request.body, merged_variables)
            else:
                resolved_body = request.body

        body_type = (request.body_type or 'JSON').upper()
        if body_type in ('FORM-DATA', 'URL-ENCODED'):
            default_content_type = 'application/x-www-form-urlencoded'
        else:
            default_content_type = 'application/json'

        final_headers = {
            'Content-Type': default_content_type,
            'User-Agent': 'API-Testing-Tool/1.0',
            **resolved_headers,
            **resolve_variables(request.headers, merged_variables),
        }

        if resolved_url and ('.ngrok.' in resolved_url or 'ngrok-free.app' in resolved_url):
            final_headers['ngrok-skip-browser-warning'] = 'true'

        # Inject per-API auth only for saved requests (ephemeral has no auth config in DB)
        if request.file_id is not None:
            auth_config = await resolve_auth(db, request.file_id)
            if auth_config:
                body_bytes: bytes | None = None
                if resolved_body is not None:
                    if isinstance(resolved_body, (dict, list)):
                        body_bytes = json.dumps(resolved_body).encode("utf-8")
                    elif isinstance(resolved_body, str):
                        body_bytes = resolved_body.encode("utf-8")
                auth_headers, auth_params = await apply_auth_async(
                    auth_config,
                    method=request.method.upper(),
                    url=resolved_url,
                    existing_headers=final_headers,
                    body_bytes=body_bytes,
                    db=db,
                    owner_username=username,
                )
                for k, v in auth_headers.items():
                    if k not in final_headers:
                        final_headers[k] = v
                resolved_params = {**auth_params, **resolved_params}

        # 5. Fire the request via shared send_request
        timeout = request.options.get('timeout', 30.0)
        result = await send_request(
            method=request.method,
            url=resolved_url,
            headers=final_headers,
            params=resolved_params,
            body=resolved_body,
            body_type=body_type,
            timeout=timeout,
        )
        final_url = result["resolved_url"]

        # 6. Return structured response
        return create_response(
            response_code=200,
            data={
                **result,
                "resolved_headers": final_headers,
                "variables_used": merged_variables,
                "request_details": {
                    "method": request.method.upper(),
                    "original_url": request.url,
                    "resolved_params": resolved_params,
                    "has_body": resolved_body is not None,
                },
            }
        )

    except (httpx.ConnectError, httpx.TimeoutException, httpx.RequestError) as e:
        return handle_http_error(
            e,
            url=resolved_url if 'resolved_url' in locals() else request.url,
            method=request.method.upper(),
            headers=final_headers if 'final_headers' in locals() else request.headers,
        )
    except Exception as e:
        logs(f"execute_api_direct error: {type(e).__name__}", type="error")
        return ExceptionHandler(e)


@router.post("/execute-with-validation")
async def execute_api_with_validation(
    request: ApiExecuteRequest,
    username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db)
):
    """POST /api/execute-with-validation — call execute_api_direct then run evaluate_expect against request.expected; return response enriched with validation pass/fail details."""
    try:
        # 1. First, execute the API using the working execute_api_direct function
        api_response = await execute_api_direct(request, username, db)

        # 2. If no expected criteria provided, return the normal response
        if not request.expected:
            return api_response

        # 3. Extract the execution data from the API response
        # The api_response is a JSONResponse object with the data in its content
        try:
            # Get the response content
            if hasattr(api_response, 'body'):
                # For JSONResponse, access the body
                response_content = bytes(api_response.body).decode('utf-8')
                response_data = json.loads(response_content)
            else:
                # Fallback - this shouldn't happen but provides safety
                logs("Unexpected response format from execute_api_direct", type="error")
                return api_response

            execution_data = response_data.get('data', {})
            if not execution_data:
                logs("No execution data found in API response", type="error")
                return api_response

        except Exception as e:
            logs(f"Error extracting execution data: {type(e).__name__}", type="error")
            return api_response

        # 4. Create mock response object for validation
        class MockResponse:
            def __init__(self, status_code, text, headers):
                self.status_code = status_code
                self.text = text
                self.headers = headers
                self._json_data = None

            def json(self):
                if self._json_data is None:
                    try:
                        self._json_data = json.loads(self.text) if self.text else {}
                    except json.JSONDecodeError:
                        self._json_data = {}
                return self._json_data

        # 5. Create mock response from the actual API response data
        mock_response = MockResponse(
            status_code=execution_data.get("status_code", 200),
            text=execution_data.get("text", ""),
            headers=execution_data.get("headers", {})
        )

        # 6. Perform validation using the existing validator
        validation_passed, validation_failures = evaluate_expect(mock_response, request.expected)

        # 7. Add validation results to the execution data
        execution_data['validation'] = {
            "performed": True,
            "passed": validation_passed,
            "failures": validation_failures,
            "expected_criteria": request.expected,
            "summary": f"{'PASSED' if validation_passed else 'FAILED'} - {len(validation_failures)} failure(s)"
        }

        # 8. Return enhanced response with validation results
        return create_response(200, data=execution_data)

    except Exception as e:
        logs(f"execute_with_validation error: {type(e).__name__}", type="error")
        return ExceptionHandler(e)
