"""
What this file does: Exposes DELETE /environment/workspace/{workspace_id}/environments/{environment_id}/variables for clearing all variables from an environment.
"""

from fastapi import APIRouter, Depends, Header as FastAPIHeader
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import resolve_workspace_access, has_min_role
from models import Environment
from utils import create_response

router = APIRouter()


@router.delete("/workspace/{workspace_id}/environments/{environment_id}/variables")
async def delete_environment_variables(
    workspace_id: int,
    environment_id: int,
    username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db)
):
    """DELETE /environment/workspace/{workspace_id}/environments/{environment_id}/variables — clear all variables from an environment by setting the field to None."""
    access = await resolve_workspace_access(db, username, workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if access.workspace_id is None:
        return create_response(404, error_message="Workspace not found")
    if not has_min_role(access, "editor"):
        return create_response(403, error_message="Editor access or higher required")

    row = (await db.execute(
        select(Environment.id, Environment.variables).where(
            Environment.id == environment_id,
            Environment.workspace_id == workspace_id,
        )
    )).first()
    if row is None:
        return create_response(404, error_message="Environment not found")

    env_id, env_vars = row
    if not env_vars:
        # Frontend (unwrapResponse.js) special-cases this exact 206 + message as "empty, not error" — do not change.
        return create_response(206, error_message="No variables found for this environment")

    await db.execute(
        update(Environment).where(Environment.id == env_id).values(variables=None)
    )
    await db.commit()

    return create_response(200, {"message": "Variables deleted successfully"})
