"""
What this file does: Exposes the DELETE /workspace/{workspace_id} route for deleting a workspace and all its cascaded contents.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import get_user_by_username
from models import Workspace
from utils import (
    ExceptionHandler,
    create_response
)

router = APIRouter()


@router.delete("/{workspace_id}")
async def delete_workspace(
    workspace_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """DELETE /workspace/{workspace_id} — permanently delete the workspace and all its cascaded data."""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Get workspace
        result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
        workspace = result.scalar_one_or_none()

        if not workspace:
            return create_response(404, error_message="Workspace not found")
        if workspace.user_id != user.id:
            return create_response(403, error_message="Only the workspace owner can delete it")

        # Delete workspace (cascade will handle related data)
        await db.delete(workspace)
        await db.commit()

        return create_response(200, {"message":"Workspace deleted successfully"})

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)