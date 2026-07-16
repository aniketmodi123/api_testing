"""
What this file does: Exposes the PUT /workspace/{workspace_id} route for updating workspace name and description.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import get_user_by_username
from models import User, Workspace
from schema import WorkspaceUpdateRequest
from utils import ExceptionHandler, create_response, value_correction

router = APIRouter()


@router.put("/{workspace_id}")
async def update_workspace(
    workspace_id: int,
    workspace_data: WorkspaceUpdateRequest,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """PUT /workspace/{workspace_id} — update name and/or description for a workspace owned by the caller."""
    try:
        row = (await db.execute(
            select(User, Workspace)
            .select_from(User)
            .outerjoin(Workspace, Workspace.id == workspace_id)
            .where(User.email == username)
        )).first()
        if row is None:
            return create_response(400, error_message="User not found")
        user, workspace = row
        if workspace is None:
            return create_response(404, error_message="Workspace not found")
        if workspace.user_id != user.id:
            return create_response(403, error_message="Only the workspace owner can update it")

        if workspace_data.name is not None:
            workspace.name = workspace_data.name
        if workspace_data.description is not None:
            workspace.description = workspace_data.description

        await db.commit()

        data = {
            "id": workspace.id,
            "user_id": workspace.user_id,
            "name": workspace.name,
            "description": workspace.description,
            "created_at": str(workspace.created_at),
            "nodes": [],
        }
        return create_response(200, value_correction(data))

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
