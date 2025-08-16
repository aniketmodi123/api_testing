from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db, get_user_by_username
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
    """Delete workspace and all its contents"""
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
            return create_response(404, error_message="Workspace not found or access denied")

        # Delete workspace (cascade will handle related data)
        await db.delete(workspace)
        await db.commit()

        return create_response(200, {"message":"Workspace deleted successfully"})

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)