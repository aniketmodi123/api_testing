"""
What this file does: Exposes GET /case/{case_id} for retrieving a test case with its API and file context.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import resolve_case_access
from schema import ApiCaseFullResponse
from utils import ExceptionHandler, create_response

router = APIRouter()


@router.get("/case/{case_id}")
async def get_test_case_details(
    case_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """GET /case/{case_id} — return test case fields along with its parent API method, endpoint, and file context."""
    try:
        # Step 1: Resolve caller, case, API, and file node in one query
        ca = await resolve_case_access(db, username, case_id)
        if ca.user is None:
            return create_response(401, error_message="User not found")
        if ca.case is None or not ca.can_access:
            return create_response(404, error_message="Test case not found or access denied")

        case, api, file_node = ca.case, ca.api, ca.node
        case_headers = case.headers or {}

        # Step 2: Build the response payload
        data = {
            "id": case.id,
            "api_id": case.api_id,
            "name": case.name,
            "headers": case_headers,
            "case_specific_headers": case_headers,
            "params": case.params or {},
            "body": case.body,
            "expected": case.expected,
            "created_at": case.created_at,
            "api_name": api.name,
            "api_method": api.method,
            "api_endpoint": api.endpoint,
            "file_id": api.file_id,
            "file_name": file_node.name,
            "workspace_id": file_node.workspace_id,
        }

        return create_response(200, data, ApiCaseFullResponse)

    except Exception as e:
        return ExceptionHandler(e)
