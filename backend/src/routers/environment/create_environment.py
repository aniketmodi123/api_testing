"""
What this file does: Exposes POST /environment/workspace/{workspace_id}/environments for creating a new environment within a workspace.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from models import Environment
from schema import EnvironmentCreate, EnvironmentResponse
from config import get_db
from common_querys import resolve_workspace_access, has_min_role, write_audit
from utils import create_response, value_correction

router = APIRouter()


@router.post("/workspace/{workspace_id}/environments")
async def create_environment(
    workspace_id: int,
    environment_data: EnvironmentCreate,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """POST /environment/workspace/{workspace_id}/environments — create a new environment; deactivate others when is_active is True."""
    access = await resolve_workspace_access(db, username, workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if access.workspace_id is None:
        return create_response(404, error_message="Workspace not found")
    if not has_min_role(access, "editor"):
        return create_response(403, error_message="Editor access or higher required")

    existing = (await db.execute(
        select(Environment.id).where(
            Environment.workspace_id == workspace_id,
            Environment.name == environment_data.name,
        )
    )).scalar_one_or_none()
    if existing is not None:
        return create_response(400, error_message=f"Environment '{environment_data.name}' already exists in this workspace")

    if environment_data.is_active:
        await db.execute(
            update(Environment)
            .where(Environment.workspace_id == workspace_id, Environment.is_active == True)
            .values(is_active=False)
        )

    variables_dict = environment_data.variables or {}
    new_environment = Environment(
        workspace_id=workspace_id,
        name=environment_data.name,
        description=environment_data.description,
        is_active=environment_data.is_active,
        variables=variables_dict,
    )
    db.add(new_environment)
    await db.flush()

    await write_audit(
        db,
        username=access.user.username,
        action="environment.create",
        entity_type="environment",
        entity_id=new_environment.id,
        workspace_id=workspace_id,
        metadata={"name": new_environment.name},
    )
    await db.commit()

    data = {
        "id": new_environment.id,
        "workspace_id": new_environment.workspace_id,
        "name": new_environment.name,
        "description": new_environment.description,
        "is_active": new_environment.is_active,
        "variables": new_environment.variables or {},
        "created_at": str(new_environment.created_at),
        "updated_at": str(new_environment.updated_at),
    }
    return create_response(201, value_correction(data), EnvironmentResponse)
