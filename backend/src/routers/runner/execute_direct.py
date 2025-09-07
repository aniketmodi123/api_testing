from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Header as FastAPIHeader, HTTPException
from pydantic import BaseModel, Field
import httpx
import time
import os

from utils import (
    ExceptionHandler,
    create_response,
    replace_variables_in_text,
    replace_variables_in_dict,
    replace_variables_in_list,
    get_environment_variables,
    handle_http_error
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import (
    get_db,
    get_user_by_username,
    verify_node_ownership
)
from models import Environment, Node, Header

def resolve_docker_url(url: str) -> list:
    """
    Resolve URL for Docker container networking.
    Returns a list of possible URLs to try in order of preference.
    """
    alternative_urls = [url]  # Always try original first

    if 'localhost' in url:
        # Docker networking alternatives
        alternative_urls.extend([
            url.replace('localhost', 'host.docker.internal'),
            url.replace('localhost', '172.17.0.1'),  # Default Docker gateway
            url.replace('localhost', '127.0.0.1'),
        ])

        # Specific container mapping for known services
        if 'localhost:8003' in url:
            alternative_urls.append(
                url.replace('localhost:8003', 'mes_dashboard_dev:8000')
            )

        # Environment variable override
        docker_host = os.getenv('DOCKER_HOST_IP', None)
        if docker_host:
            alternative_urls.append(
                url.replace('localhost', docker_host)
            )

    # Remove duplicates while preserving order
    seen = set()
    unique_urls = []
    for u in alternative_urls:
        if u not in seen:
            seen.add(u)
            unique_urls.append(u)

    return unique_urls


router = APIRouter()


async def test_connectivity(url: str) -> Dict[str, Any]:
    """Test connectivity to a URL with different approaches"""
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
    """Test connectivity to a specific URL"""
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


class ApiExecuteRequest(BaseModel):
    file_id: int = Field(..., description="File ID containing the API")
    environment_id: Optional[int] = Field(None, description="Environment ID for variable resolution")
    method: str = Field("GET", description="HTTP method")
    url: str = Field(..., description="API endpoint URL")
    headers: Dict[str, Any] = Field(default_factory=dict, description="Request headers")
    params: Dict[str, Any] = Field(default_factory=dict, description="Query parameters")
    body: Any = Field(None, description="Request body")
    options: Dict[str, Any] = Field(default_factory=dict, description="Additional options")


async def get_folder_headers(db: AsyncSession, node_id: int) -> Dict[str, str]:
    """Get headers from folder hierarchy"""
    try:
        # Get the node (file or folder)
        node_query = select(Node).where(Node.id == node_id)
        node_result = await db.execute(node_query)
        node = node_result.scalar_one_or_none()

        if not node:
            return {}

        # If it's a file, get the parent folder ID
        folder_id = node.parent_id if node.parent_id else node_id

        # Get folder headers from Header table
        header_query = select(Header).where(Header.folder_id == folder_id)
        header_result = await db.execute(header_query)
        header_record = header_result.scalar_one_or_none()

        if header_record and header_record.content:
            return header_record.content

        return {}
    except Exception as e:
        print(f"Error getting folder headers: {e}")
        return {}


@router.post("/execute-direct")
async def execute_api_direct(
    request: ApiExecuteRequest,
    username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Execute API call with full backend processing:
    1. Resolve environment variables
    2. Fetch and merge folder headers
    3. Apply authentication
    4. Make external API call
    5. Return response with metadata
    """
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

        # 1. Get environment variables
        env_variables = {}
        if request.environment_id:
            # Get specific environment variables using the new function
            env_variables = await get_environment_variables(request.environment_id)
        else:
            # Get active environment variables - find active environment
            env_query = select(Environment).where(
                Environment.workspace_id == workspace_id,
                Environment.is_active == True
            )
            env_result = await db.execute(env_query)
            active_environment = env_result.scalar_one_or_none()

            if active_environment:
                env_variables = await get_environment_variables(active_environment.id)

        # 2. Get folder headers
        folder_headers = await get_folder_headers(db, request.file_id)

        # 3. Resolve variables in all request parts
        resolved_url = replace_variables_in_text(request.url, env_variables)
        resolved_headers = replace_variables_in_dict(request.headers, env_variables)
        resolved_params = replace_variables_in_dict(request.params, env_variables)
        resolved_body = None

        if request.body is not None:
            if isinstance(request.body, str):
                resolved_body = replace_variables_in_text(request.body, env_variables)
            elif isinstance(request.body, dict):
                resolved_body = replace_variables_in_dict(request.body, env_variables)
            elif isinstance(request.body, list):
                resolved_body = replace_variables_in_list(request.body, env_variables)
            else:
                resolved_body = request.body

        # 4. Merge headers (folder + request + defaults)
        final_headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'API-Testing-Tool/1.0',
            **folder_headers,  # Folder headers (lowest priority)
            **resolved_headers,  # Request headers (highest priority)
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
                if isinstance(resolved_body, (dict, list)):
                    request_data['json'] = resolved_body
                else:
                    request_data['content'] = str(resolved_body)

            # Get Docker-aware URL alternatives
            alternative_urls = resolve_docker_url(final_url)

            last_error = None
            for attempt_url in alternative_urls:
                try:
                    request_data_copy = request_data.copy()
                    request_data_copy['url'] = attempt_url

                    # Make the request
                    response = await client.request(**request_data_copy)
                    break
                except (httpx.ConnectError, httpx.RequestError) as e:
                    last_error = e
                    continue
            else:
                # If all attempts failed, raise the last error
                if last_error:
                    raise last_error

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
                "variables_used": env_variables,
                "folder_headers": folder_headers,
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
    x_username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db)
):
    """Execute API call with validation against expected results"""
    # First execute the API
    response = await execute_api_direct(request, x_username, db)

    # TODO: Add validation logic here
    # For now, just return the execution result
    return response
