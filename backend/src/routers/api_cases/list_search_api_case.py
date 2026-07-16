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

        # Step 2: Fetch only the needed case columns; the list is unpaginated,
        # so its length IS the total — no separate count query needed
        conditions = [ApiCase.api_id == api.id]
        if search:
            conditions.append(ApiCase.name.ilike(f"%{search}%"))

        cases_result = await db.execute(
            select(
                ApiCase.id,
                ApiCase.api_id,
                ApiCase.name,
                ApiCase.headers,
                ApiCase.params,
                ApiCase.body,
                ApiCase.expected,
                ApiCase.created_at,
            )
            .where(*conditions)
            .order_by(func.lower(ApiCase.name))
        )
        test_cases = [dict(row) for row in cases_result.mappings()]

        # Step 3: Build the response payload
        data = {
            "file_id": file_id,
            "file_name": file_node.name,
            "workspace_id": file_node.workspace_id,
            "api_id": api.id,
            "api_name": api.name,
            "api_method": api.method,
            "api_endpoint": api.endpoint,
            "test_cases": test_cases,
            "total_cases": len(test_cases),
        }

        return create_response(200, data, ApiCaseListResponse)

    except Exception as e:
        return ExceptionHandler(e)
