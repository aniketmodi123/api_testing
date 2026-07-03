"""
What this file does: Exposes GET /file/{file_id}/api/cases for listing and searching test cases for a file's API.
"""

from typing import Optional

from fastapi import APIRouter, Depends, Header
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import resolve_file_access
from models import ApiCase
from schema import ApiCaseListResponse
from utils import ExceptionHandler, create_response

router = APIRouter()


@router.get("/file/{file_id}/api/cases")
async def list_test_cases_for_file_api(
    file_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = None
):
    """GET /file/{file_id}/api/cases — list all test cases for the file's API, optionally filtered by case name search term."""
    try:
        # Step 1: Resolve caller, file node, and its API in one query
        fa = await resolve_file_access(db, username, file_id)
        if fa.user is None:
            return create_response(401, error_message="User not found")
        if fa.node is None or not fa.can_access:
            return create_response(404, error_message="File not found or access denied")
        if fa.node.type != "file":
            return create_response(400, error_message="Can only list test cases from files, not folders")
        if fa.api is None:
            return create_response(404, error_message="No API found in this file")

        api, file_node = fa.api, fa.node

        # Step 2: Build the filtered query and a count over the SAME filter
        conditions = [ApiCase.api_id == api.id]
        if search:
            conditions.append(ApiCase.name.ilike(f"%{search}%"))

        count_result = await db.execute(
            select(func.count()).select_from(ApiCase).where(*conditions)
        )
        total_cases = count_result.scalar()

        cases_result = await db.execute(
            select(ApiCase).where(*conditions).order_by(func.lower(ApiCase.name))
        )
        cases = cases_result.scalars().all()

        # Step 3: Build the response payload
        data = {
            "file_id": file_id,
            "file_name": file_node.name,
            "workspace_id": file_node.workspace_id,
            "api_id": api.id,
            "api_name": api.name,
            "api_method": api.method,
            "api_endpoint": api.endpoint,
            "test_cases": [
                {
                    "id": case.id,
                    "api_id": case.api_id,
                    "name": case.name,
                    "headers": case.headers,
                    "params": case.params,
                    "body": case.body,
                    "expected": case.expected,
                    "created_at": case.created_at,
                }
                for case in cases
            ],
            "total_cases": total_cases,
        }

        return create_response(200, data, ApiCaseListResponse)

    except Exception as e:
        return ExceptionHandler(e)
