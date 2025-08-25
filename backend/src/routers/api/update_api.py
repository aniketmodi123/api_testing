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
from schema import ApiUpdateRequest
from utils import (
    ExceptionHandler,
    create_response,
    value_correction
)

router = APIRouter()


@router.put("/file/{file_id}/api")
async def update_file_api(
    file_id: int,
    request: ApiUpdateRequest,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Update API in a file"""
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
            return create_response(400, error_message="Can only update API in files, not folders")

        # Get API from file
        result = await db.execute(
            select(Api).where(Api.file_id == file_id)
        )
        api = result.scalar_one_or_none()

        if not api:
            return create_response(206, error_message="No API found in this file")

        # Update fields
        update_data = request.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(api, field, value)

        await db.commit()
        await db.refresh(api)

        # Get case count
        case_count_result = await db.execute(
            select(ApiCase.id).where(ApiCase.api_id == api.id)
        )
        case_count = len(case_count_result.fetchall())

        data = {
            "id": api.id,
            "file_id": api.file_id,
            "name": api.name,
            "method": api.method,
            "endpoint": api.endpoint,
            "description": api.description,
            "is_active": api.is_active,
            "extra_meta": api.extra_meta,
            "created_at": api.created_at,
            "file_name": file_node.name,
            "workspace_id": file_node.workspace_id,
            "total_cases": case_count
        }

        return create_response(200, value_correction(data))

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)


@router.put("/file/{file_id}/api/status")
async def toggle_file_api_status(
    file_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
    is_active: Optional[bool] = None
):
    """Toggle API active/inactive status in a file"""
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
            return create_response(400, error_message="Can only toggle API status in files, not folders")

        # Get API from file
        result = await db.execute(
            select(Api).where(Api.file_id == file_id)
        )
        api = result.scalar_one_or_none()

        if not api:
            return create_response(206, error_message="No API found in this file")

        # Toggle or set status
        if is_active is not None:
            api.is_active = is_active
        else:
            api.is_active = not api.is_active

        await db.commit()

        data = {
            "id": api.id,
            "name": api.name,
            "file_id": file_id,
            "file_name": file_node.name,
            "is_active": api.is_active,
            "message": f"API '{api.name}' in file '{file_node.name}' is now {'active' if api.is_active else 'inactive'}"
        }

        return create_response(200, value_correction(data))

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)
