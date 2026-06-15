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
    get_environment_variables
)
from routers.variables.global_variables import get_global_variables_for_user
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from common_querys import get_user_by_username, verify_node_ownership, get_headers
from config import get_db
from models import Environment, Node

def resolve_docker_url(url: str) -> str:
    """What it does: Replace 'localhost' with 'host.docker.internal' so the container can reach the host machine."""
    if 'localhost' in url:
        # Replace localhost with host.docker.internal for Docker networking
        return url.replace('localhost', 'host.docker.internal')

    return url


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
            async with httpx.AsyncClient(timeout=5.0, verify=False) as client:
                response = await client.get(test_url)
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
    """POST /api/execute-direct — resolve variables (global → env), merge folder headers, and fire the external HTTP request; return response with timing and resolved metadata."""
    try:
        # Verify user permissions
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify node ownership
        if not await verify_node_ownership(db, request.file_id, user.id):
            return create_response(400, error_message="Access denied")

        # Get file details to find workspace
        file_query = select(Node).where(Node.id == request.file_id)
        file_result = await db.execute(file_query)
        file_node = file_result.scalar_one_or_none()

        if not file_node:
            return create_response(206, error_message="File not found")

        workspace_id = file_node.workspace_id

        # 1. Get global variables (lowest priority)
        global_vars = await get_global_variables_for_user(username)

        # 2. Get environment variables (overrides global)
        env_variables = {}
        if request.environment_id:
            env_variables = await get_environment_variables(request.environment_id)
        else:
            env_query = select(Environment).where(
                Environment.workspace_id == workspace_id,
                Environment.is_active == True
            )
            env_result = await db.execute(env_query)
            active_environment = env_result.scalar_one_or_none()
            if active_environment:
                env_variables = await get_environment_variables(active_environment.id)

        # Merge scopes: global < env
        merged_variables = merge_scopes(global_vars, env_variables)

        # 3. Get merged headers using get_headers (includes parent folders and file)
        folder_path, folder_ids, headers_map, merge_result = await get_headers(db, request.file_id)
        merged_headers = merge_result.get("merged_headers", {})


        # 4. Resolve variables in all request parts using merged scope
        resolved_url = resolve_variables(request.url, merged_variables)
        resolved_headers = resolve_variables(merged_headers, merged_variables)
        resolved_params = resolve_variables(request.params, merged_variables)
        resolved_body = None

        if request.body is not None:
            if isinstance(request.body, str):
                resolved_body = resolve_variables(request.body, merged_variables)
            elif isinstance(request.body, dict):
                resolved_body = resolve_variables(request.body, merged_variables)
            elif isinstance(request.body, list):
                resolved_body = resolve_variables(request.body, merged_variables)
            else:
                resolved_body = request.body

        # 5. Merge headers (merged + request + defaults)
        # Determine default Content-Type based on body_type
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

        # Add ngrok headers if needed
        if resolved_url and ('.ngrok.' in resolved_url or 'ngrok-free.app' in resolved_url):
            final_headers['ngrok-skip-browser-warning'] = 'true'

        # 5. Prepare request configuration
        timeout = request.options.get('timeout', 30.0)

        # Build final URL with query parameters
        final_url = resolved_url
        if resolved_params:
            param_string = '&'.join([f"{k}={v}" for k, v in resolved_params.items() if v is not None])
            if param_string:
                separator = '&' if '?' in final_url else '?'
                final_url = f"{final_url}{separator}{param_string}"

        # 6. Make external API call
        start_time = time.time()

        # Configure httpx client with more permissive settings
        client_config = {
            'timeout': timeout,
            'verify': False,  # Disable SSL verification for localhost
            'follow_redirects': True,
            'limits': httpx.Limits(max_keepalive_connections=5, max_connections=10)
        }

        async with httpx.AsyncClient(**client_config) as client:
            # Prepare request data
            request_data = {
                'method': request.method.upper(),
                'url': final_url,
                'headers': final_headers,
            }

            # Add body for non-GET requests
            if request.method.upper() != 'GET' and resolved_body is not None:
                if body_type in ('FORM-DATA', 'URL-ENCODED'):
                    # Send as URL-encoded form data
                    if isinstance(resolved_body, str):
                        request_data['content'] = resolved_body.encode('utf-8')
                        final_headers['Content-Type'] = 'application/x-www-form-urlencoded'
                    else:
                        request_data['data'] = resolved_body
                elif isinstance(resolved_body, (dict, list)):
                    request_data['json'] = resolved_body
                else:
                    request_data['content'] = str(resolved_body)

            # Get Docker-aware resolved URL
            resolved_final_url = resolve_docker_url(final_url)
            request_data['url'] = resolved_final_url

            # Make the request
            response = await client.request(**request_data)

        execution_time = time.time() - start_time

        # 7. Parse response
        response_text = response.text
        response_json = None

        try:
            response_json = response.json()
        except:
            # Not JSON, keep as text
            pass

        # 8. Return structured response
        return create_response(
            response_code=200,
            data={
                "status_code": response.status_code,
                "headers": dict(response.headers),
                "text": response_text,
                "json": response_json,
                "execution_time": round(execution_time, 3),
                "resolved_url": final_url,
                "resolved_headers": final_headers,
                "variables_used": merged_variables,
                # "folder_headers": folder_headers,  # Removed: not defined, merged headers are in resolved_headers
                "request_details": {
                    "method": request.method.upper(),
                    "original_url": request.url,
                    "resolved_params": resolved_params,
                    "has_body": resolved_body is not None
                }
            }
        )

    except (httpx.ConnectError, httpx.TimeoutException, httpx.RequestError) as e:
        # Use the convenient helper function
        return handle_http_error(
            e,
            url=final_url if 'final_url' in locals() else request.url,
            method=request.method.upper(),
            headers=final_headers if 'final_headers' in locals() else request.headers
        )
    except Exception as e:
        print(f"Error executing API: {e}")
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
                print("Warning: Unexpected response format from execute_api_direct")
                return api_response

            execution_data = response_data.get('data', {})
            if not execution_data:
                print("Warning: No execution data found in API response")
                return api_response

        except Exception as e:
            print(f"Error extracting execution data: {e}")
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
        print(f"Error in validation: {e}")
        return ExceptionHandler(e)
