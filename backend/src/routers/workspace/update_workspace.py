from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db, get_user_by_username
from models import Workspace
from schema import WorkspaceUpdateRequest
from utils import (
    ExceptionHandler,
    create_response,
    value_correction
)

router = APIRouter()


@router.put("/{workspace_id}")
async def update_workspace(
    workspace_id: int,
    workspace_data: WorkspaceUpdateRequest,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Update workspace details"""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Get workspace
        result = await db.execute(
            select(Workspace).where(
                and_(
                    Workspace.id == workspace_id,
                    Workspace.user_id == user.id
                )
            )
        )
        workspace = result.scalar_one_or_none()

        if not workspace:
            return create_response(206, error_message="Workspace not found or access denied")

        # Update workspace fields
        if workspace_data.name is not None:
            workspace.name = workspace_data.name
        if workspace_data.description is not None:
            workspace.description = workspace_data.description

        await db.commit()
        await db.refresh(workspace)
        data = {
            "id": workspace.id,
            "user_id": workspace.user_id,
            "name": workspace.name,
            "description": workspace.description,
            "created_at": str(workspace.created_at),
            "nodes": []
        }
        return create_response(200, value_correction(data))

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)
