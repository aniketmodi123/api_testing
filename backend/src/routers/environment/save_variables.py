"""
What this file does: Exposes POST /environment/workspace/{workspace_id}/environments/{environment_id}/variables for setting environment variables.
"""

from fastapi import APIRouter, Depends, Header as FastAPIHeader
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from common_querys import resolve_workspace_access, has_min_role
from config import get_db
from models import Environment
from schema import VariablesSetRequest, VariablesResponse
from utils import create_response, value_correction

router = APIRouter()


@router.post("/workspace/{workspace_id}/environments/{environment_id}/variables")
async def save_environment_variables(
    workspace_id: int,
    environment_id: int,
    variables_data: VariablesSetRequest,
    username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db)
):
    """POST /environment/workspace/{workspace_id}/environments/{environment_id}/variables — overwrite the environment's key-value variables; returns 201 on first save, 200 on update."""
    access = await resolve_workspace_access(db, username, workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if access.workspace_id is None:
        return create_response(404, error_message="Workspace not found")
    if not has_min_role(access, "editor"):
        return create_response(403, error_message="Editor access or higher required")

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

    env_id, env_name, env_vars, created_at, updated_at = row
    is_create = not env_vars

    await db.execute(
        update(Environment)
        .where(Environment.id == env_id)
        .values(variables=variables_data.variables)
    )
    await db.commit()

    data = {
        "environment_id": env_id,
        "environment_name": env_name,
        "variables": variables_data.variables,
        "created_at": created_at,
        "updated_at": updated_at,
    }
    status_code = 201 if is_create else 200
    return create_response(status_code, value_correction(data), VariablesResponse)
