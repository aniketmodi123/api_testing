# Example usage of the global error handling system

import httpx
from utils import ExceptionHandler, handle_http_error

# Example 1: Using handle_http_error for HTTP requests
async def make_api_call(url: str, headers: dict):
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers)
            return response
    except (httpx.ConnectError, httpx.TimeoutException, httpx.RequestError) as e:
        # Use the global HTTP error handler
        return handle_http_error(e, url=url, method="GET", headers=headers)

# Example 2: Using ExceptionHandler with custom context
async def database_operation():
    try:
        # Some database operation
        pass
    except Exception as e:
        # Use the global exception handler with custom context
        context_data = {
            'operation': 'database_query',
            'table': 'users',
            'query_type': 'SELECT'
        }
        return ExceptionHandler(e, context_data)

# Example 3: Using ExceptionHandler for general errors
def file_operation():
    try:
        # Some file operation
        with open("nonexistent.txt", "r") as f:
            content = f.read()
    except Exception as e:
        # Simple usage without context
        return ExceptionHandler(e)

# The global error handler will automatically:
# 1. Detect the error type (HTTP, Database, File, etc.)
# 2. Provide appropriate HTTP status codes
# 3. Return structured error responses
# 4. Include troubleshooting information for connection errors
# 5. Maintain consistency across the entire application
