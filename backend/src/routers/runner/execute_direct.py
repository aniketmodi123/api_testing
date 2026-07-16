"""
What this file does: Exposes POST /api/execute-direct and /api/execute-with-validation for firing external HTTP requests with variable resolution, inherited folder headers, and optional assertion evaluation.
"""

from typing import Any, Dict, Tuple
from fastapi import APIRouter, Depends, Header as FastAPIHeader, HTTPException
import httpx, time, json

from schema import ApiExecuteRequest, ExecuteDirectResponse, ExecuteWithValidationResponse, TestConnectivityResponse
from routers.runner.validator import evaluate_expect

from utils import create_response, resolve_variables, handle_http_error
from http_client import get_http_client
from ssrf import assert_safe_url
from sqlalchemy.ext.asyncio import AsyncSession
from common_querys import get_user_by_username, resolve_file_access, get_headers, resolve_auth, build_scope_chain
from config import get_db
from auth_strategies import apply_auth_async


def resolve_docker_url(url: str) -> str:
    """What it does: Replace 'localhost' with 'host.docker.internal' so the container can reach the host machine."""
    return url.replace("localhost", "host.docker.internal") if "localhost" in url else url


class _ExecError(Exception):
    """Carry a ready-made create_response result out of _execute_impl for business-logic failures."""
    def __init__(self, response: Any) -> None:
        self.response = response


class _MockResponse:
    """Minimal httpx-compatible response shim used by evaluate_expect inside execute-with-validation."""
    def __init__(self, status_code: int, text: str, headers: Dict[str, str], body_json: Any = None) -> None:
        self.status_code = status_code
        self.text = text
        self.headers = headers
        self._json_data = body_json

    def json(self) -> Any:
        if self._json_data is None:
            try:
                self._json_data = json.loads(self.text) if self.text else {}
            except json.JSONDecodeError:
                self._json_data = {}
        return self._json_data


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
    final_url = url
    if params and isinstance(params, dict):
        remaining_params = {}
        for k, v in params.items():
            placeholder = f"{{{k}}}"
            if placeholder in final_url:
                final_url = final_url.replace(placeholder, str(v))
            else:
                remaining_params[k] = v
        params = remaining_params

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
    test_urls = [
        url,
        url.replace("localhost", "127.0.0.1"),
        url.replace("localhost", "host.docker.internal") if "localhost" in url else None,
    ]
    for test_url in (u for u in test_urls if u is not None):
        try:
            assert_safe_url(test_url)
            client = get_http_client()
            response = await client.get(test_url, timeout=5.0)
            results[test_url] = {
                "status": "success",
                "status_code": response.status_code,
                "response_time": "< 5s",
            }
        except Exception as e:
            results[test_url] = {"status": "failed", "error": str(e)}
    return results


async def _execute_impl(
    request: ApiExecuteRequest,
    username: str,
    db: AsyncSession,
) -> Tuple[Dict[str, Any], str, str, Dict[str, Any]]:
    """
    What it does: Resolve variables, merge folder headers, inject auth, fire the external HTTP request; return (data_dict, resolved_url, method, final_headers).
    Raises:
        _ExecError: For auth/access failures — carries a ready-made create_response result.
        httpx.ConnectError, httpx.TimeoutException, httpx.RequestError: Propagated from send_request; callers convert via handle_http_error.
    """
    method = request.method.upper()

    if request.file_id is not None:
        access = await resolve_file_access(db, username, request.file_id)
        if not access.user:
            raise _ExecError(create_response(400, error_message="User not found"))
        if not access.node:
            raise _ExecError(create_response(404, error_message="File not found"))
        if not access.can_access:
            raise _ExecError(create_response(403, error_message="Access denied"))

        workspace_id = access.node.workspace_id
        merged_variables = await build_scope_chain(
            db, file_id=request.file_id, username=username, workspace_id=workspace_id
        )
        _, __, ___, merge_result = await get_headers(db, request.file_id)
        merged_headers = merge_result.get("merged_headers", {})
    else:
        user = await get_user_by_username(db, username)
        if not user:
            raise _ExecError(create_response(400, error_message="User not found"))
        merged_variables = {}
        merged_headers = {}

    resolved_url = resolve_variables(request.url, merged_variables)
    resolved_headers = resolve_variables(merged_headers, merged_variables)
    resolved_params = resolve_variables(request.params, merged_variables)

    resolved_body = None
    if request.body is not None:
        if isinstance(request.body, (str, dict, list)):
            resolved_body = resolve_variables(request.body, merged_variables)
        else:
            resolved_body = request.body

    body_type = (request.body_type or "JSON").upper()
    default_content_type = (
        "application/x-www-form-urlencoded"
        if body_type in ("FORM-DATA", "URL-ENCODED")
        else "application/json"
    )

    final_headers: Dict[str, Any] = {
        "Content-Type": default_content_type,
        "User-Agent": "API-Testing-Tool/1.0",
        **resolved_headers,
        **resolve_variables(request.headers, merged_variables),
    }
    if resolved_url and (".ngrok." in resolved_url or "ngrok-free.app" in resolved_url):
        final_headers["ngrok-skip-browser-warning"] = "true"

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
                method=method,
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

    timeout = request.options.get("timeout", 30.0)
    result = await send_request(
        method=method,
        url=resolved_url,
        headers=final_headers,
        params=resolved_params,
        body=resolved_body,
        body_type=body_type,
        timeout=timeout,
    )

    data: Dict[str, Any] = {
        **result,
        "resolved_headers": final_headers,
        "variables_used": merged_variables,
        "request_details": {
            "method": method,
            "original_url": request.url,
            "resolved_params": resolved_params,
            "has_body": resolved_body is not None,
        },
    }
    return data, resolved_url, method, final_headers


@router.post("/test-connectivity")
async def test_url_connectivity(
    url: str,
    x_username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db),
) -> Any:
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
                "recommendation": "Use the URL that shows 'success' status",
            },
            schema=TestConnectivityResponse,
        )
    except Exception as e:
        return handle_http_error(e, url=url, method="GET", headers={})


@router.post("/execute-direct")
async def execute_api_direct(
    request: ApiExecuteRequest,
    username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """POST /api/execute-direct — resolve variables (global → env), merge folder headers, and fire the external HTTP request; return response with timing and resolved metadata. When file_id is None (ephemeral/scratch request), skips DB scope chain and auth injection — fires with only the variables and headers supplied in the request body."""
    resolved_url: str = request.url
    method: str = request.method.upper()
    final_headers: Dict[str, Any] = {}
    try:
        data, resolved_url, method, final_headers = await _execute_impl(request, username, db)
        return create_response(response_code=200, data=data, schema=ExecuteDirectResponse)
    except _ExecError as e:
        return e.response
    except (httpx.ConnectError, httpx.TimeoutException, httpx.RequestError) as e:
        return handle_http_error(e, url=resolved_url, method=method, headers=final_headers)


@router.post("/execute-with-validation")
async def execute_api_with_validation(
    request: ApiExecuteRequest,
    username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """POST /api/execute-with-validation — call _execute_impl then run evaluate_expect against request.expected; return response enriched with validation pass/fail details."""
    resolved_url: str = request.url
    method: str = request.method.upper()
    final_headers: Dict[str, Any] = {}
    try:
        data, resolved_url, method, final_headers = await _execute_impl(request, username, db)

        if not request.expected:
            return create_response(response_code=200, data=data, schema=ExecuteDirectResponse)

        mock = _MockResponse(
            status_code=data.get("status_code", 200),
            text=data.get("text", ""),
            headers=data.get("headers", {}),
            body_json=data.get("json"),
        )
        validation_passed, validation_failures = evaluate_expect(mock, request.expected)
        data["validation"] = {
            "performed": True,
            "passed": validation_passed,
            "failures": validation_failures,
            "expected_criteria": request.expected,
            "summary": f"{'PASSED' if validation_passed else 'FAILED'} - {len(validation_failures)} failure(s)",
        }
        return create_response(response_code=200, data=data, schema=ExecuteWithValidationResponse)
    except _ExecError as e:
        return e.response
    except (httpx.ConnectError, httpx.TimeoutException, httpx.RequestError) as e:
        return handle_http_error(e, url=resolved_url, method=method, headers=final_headers)
