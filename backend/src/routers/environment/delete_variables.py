"""
What this file does: Exposes DELETE /environment/workspace/{workspace_id}/environments/{environment_id}/variables for clearing all variables from an environment.
"""

from fastapi import APIRouter, Depends, Header as FastAPIHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import get_user_by_username, can_access_workspace

from models import Environment, Workspace
from utils import (
    ExceptionHandler,
    create_response
)

router = APIRouter()


@router.delete("/workspace/{workspace_id}/environments/{environment_id}/variables")
async def delete_environment_variables(
    workspace_id: int,
    environment_id: int,
    username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db)
):
    """DELETE /environment/workspace/{workspace_id}/environments/{environment_id}/variables — clear all variables from an environment by setting the field to None."""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify workspace exists and user has at least editor access
        workspace_result = await db.execute(select(Workspace.id).where(Workspace.id == workspace_id))
        if workspace_result.scalar_one_or_none() is None:
            return create_response(404, error_message="Workspace not found")

        if not await can_access_workspace(db, workspace_id, user.id, min_role="editor"):
            return create_response(403, error_message="Editor access or higher required")

        # Get environment
        environment_result = await db.execute(
            select(Environment).where(
                Environment.id == environment_id,
                Environment.workspace_id == workspace_id
            )
        )
        environment = environment_result.scalar_one_or_none()
        if not environment:
            return create_response(404, error_message="Environment not found")

        if not environment.variables:
            # Frontend (unwrapResponse.js) special-cases this exact 206 + message as "empty, not error" — do not change.
            return create_response(206, error_message="No variables found for this environment")

        # Delete variables by setting to None/empty
        environment.variables = None

        await db.commit()

        return create_response(200, {"message": "Variables deleted successfully"})

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
