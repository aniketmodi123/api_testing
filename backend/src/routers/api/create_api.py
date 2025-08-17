from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import (
    get_db,
    get_user_by_username,
    verify_node_ownership
)
from models import Api
from schema import ApiCreateRequest
from utils import (
    ExceptionHandler,
    create_response,
    value_correction
)

router = APIRouter()


@router.post("/file/{file_id}/api")
async def create_api(
    file_id: int,
    request: ApiCreateRequest,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Create new API in a file"""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify file ownership and that it's actually a file
        file_node = await verify_node_ownership(db, file_id, user.id)
        if not file_node:
            return create_response(206, error_message="File not found or access denied")

        if file_node.type != "file":
            return create_response(400, error_message="Can only create APIs in files, not folders")

        # Check if API with same name already exists in this file
        existing_api = await db.execute(
            select(Api).where(
                Api.file_id == file_id,
            )
        )
        if existing_api.scalar_one_or_none():
            return create_response(400, error_message="API with this name already exists in this file")

        # Create new API
        new_api = Api(
            file_id=file_id,
            name=request.name,
            method=request.method,
            endpoint=request.endpoint,
            description=request.description,
            version=request.version,
            is_active=request.is_active,
            extra_meta=request.extra_meta or {}
        )

        db.add(new_api)
        await db.commit()
        await db.refresh(new_api)

        data = {
            "id": new_api.id,
            "file_id": new_api.file_id,
            "name": new_api.name,
            "method": new_api.method,
            "endpoint": new_api.endpoint,
            "description": new_api.description,
            "version": new_api.version,
            "is_active": new_api.is_active,
            "extra_meta": new_api.extra_meta,
            "created_at": new_api.created_at,
            "file_name": file_node.name,
            "workspace_id": file_node.workspace_id
        }

        return create_response(201, value_correction(data))

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)


