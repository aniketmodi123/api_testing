from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from config import (
    get_db,
    get_user_by_username,
    verify_node_ownership
)
from models import Api, ApiCase
from utils import (
    ExceptionHandler,
    create_response,
    value_correction
)

router = APIRouter()


@router.get("/file/{file_id}/api/cases")
async def list_test_cases_for_file_api(
    file_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = None
):
    """List all test cases for API in a specific file"""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify file ownership
        file_node = await verify_node_ownership(db, file_id, user.id)
        if not file_node:
            return create_response(206, error_message="File not found or access denied")

        if file_node.type != "file":
            return create_response(400, error_message="Can only list test cases from files, not folders")

        # Get API from file
        api_result = await db.execute(
            select(Api).where(Api.file_id == file_id)
        )
        api = api_result.scalar_one_or_none()

        if not api:
            return create_response(206, error_message="No API found in this file")

        # Build query with filters
        query = select(ApiCase).where(ApiCase.api_id == api.id)

        if search:
            search_term = f"%{search}%"
            query = query.where(ApiCase.name.ilike(search_term))

        # Get total count
        count_result = await db.execute(
            select(ApiCase.id).where(ApiCase.api_id == api.id)
        )
        total_cases = len(count_result.fetchall())

        # Execute query
        result = await db.execute(query)
        cases = result.scalars().all()

        # Format response data
        cases_data = []
        for case in cases:
            cases_data.append({
                "id": case.id,
                "api_id": case.api_id,
                "name": case.name,
                "body": case.body,
                "expected": case.expected,
                "created_at": case.created_at
            })

        data = {
            "file_id": file_id,
            "file_name": file_node.name,
            "workspace_id": file_node.workspace_id,
            "api_id": api.id,
            "api_name": api.name,
            "api_method": api.method,
            "api_endpoint": api.endpoint,
            "test_cases": cases_data,
            "total_cases": total_cases
        }

        return create_response(200, value_correction(data))
    except Exception as e:
        ExceptionHandler(e)
