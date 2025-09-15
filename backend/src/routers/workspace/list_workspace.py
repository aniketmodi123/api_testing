from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from models import Workspace
from routers.workspace.list_workspace_tree import get_user_by_username
from utils import (
    ExceptionHandler,
    create_response,
    value_correction
)

router = APIRouter()

@router.get("/list")
async def list_workspaces(
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """List all workspaces for the current user"""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Get user's workspaces
        result = await db.execute(
            select(Workspace)
            .where(Workspace.user_id == user.id)
            .order_by(Workspace.active.desc(), Workspace.created_at.desc())
        )
        workspaces = result.scalars().all()

        workspace_list = []
        for workspace in workspaces:
            workspace_list.append({
                "id": workspace.id,
                "name": workspace.name,
                "description": workspace.description,
                "created_at": workspace.created_at,
                "active": workspace.active
            })

        return create_response(200, value_correction(workspace_list))

    except Exception as e:
        ExceptionHandler(e)