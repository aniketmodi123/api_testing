"""
What this file does: Exposes GET /environment/workspace/{workspace_id}/environments/{environment_id}/variables for reading stored environment variables.
"""

from fastapi import APIRouter, Depends, Header as FastAPIHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from common_querys import resolve_workspace_access, has_min_role
from config import get_db
from models import Environment
from schema import VariablesResponse
from utils import create_response, value_correction

router = APIRouter()


@router.get("/workspace/{workspace_id}/environments/{environment_id}/variables")
async def get_environment_variables(
    workspace_id: int,
    environment_id: int,
    username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db)
):
    """GET /environment/workspace/{workspace_id}/environments/{environment_id}/variables — return the key-value variables stored in an environment."""
    access = await resolve_workspace_access(db, username, workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if access.workspace_id is None:
        return create_response(404, error_message="Workspace not found")
    if not has_min_role(access, "viewer"):
        return create_response(403, error_message="Access denied")

    row = (await db.execute(
        select(
            Environment.id,
            Environment.name,
            Environment.variables,
            Environment.created_at,
            Environment.updated_at,
        ).where(
            Environment.id == environment_id,
            Environment.workspace_id == workspace_id,
        )
    )).first()
    if not row:
        return create_response(404, error_message="Environment not found")

    env_id, env_name, env_variables, created_at, updated_at = row

    if not env_variables:
        return create_response(206, error_message="No variables found for this environment")

    data = {
        "environment_id": env_id,
        "environment_name": env_name,
        "variables": env_variables.copy(),
        "created_at": created_at,
        "updated_at": updated_at,
    }
    return create_response(200, value_correction(data), VariablesResponse)
