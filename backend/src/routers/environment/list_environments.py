"""
What this file does: Exposes CRUD routes for environment management — list, get, update, activate, and delete.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete

from models import Environment
from schema import EnvironmentUpdate, EnvironmentResponse, EnvironmentListResponse
from config import get_db
from common_querys import resolve_workspace_access, has_min_role, write_audit
from utils import create_response, value_correction

router = APIRouter()


def _env_dict(env: Environment) -> dict:
    return {
        "id": env.id,
        "name": env.name,
        "description": env.description,
        "is_active": env.is_active,
        "variables": env.variables or {},
        "created_at": str(env.created_at) if env.created_at else None,
        "updated_at": str(env.updated_at) if env.updated_at else None,
        "workspace_id": env.workspace_id,
    }


@router.get("/workspace/{workspace_id}/environments")
async def list_environments(
    workspace_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """GET /environment/workspace/{workspace_id}/environments — return all environments and highlight the currently active one."""
    access = await resolve_workspace_access(db, username, workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if access.workspace_id is None:
        return create_response(404, error_message="Workspace not found")
    if not has_min_role(access, "viewer"):
        return create_response(403, error_message="Access denied")

    result = await db.execute(
        select(Environment)
        .where(Environment.workspace_id == workspace_id)
        .order_by(Environment.created_at.desc())
    )
    environments = result.scalars().all()
    active_environment = next((e for e in environments if e.is_active), None)

    data = {
        "environments": [_env_dict(env) for env in environments],
        "total_count": len(environments),
        "active_environment": _env_dict(active_environment) if active_environment else None,
    }
    return create_response(200, value_correction(data), EnvironmentListResponse)


@router.get("/workspace/{workspace_id}/environments/{environment_id}")
async def get_environment(
    workspace_id: int,
    environment_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """GET /environment/workspace/{workspace_id}/environments/{environment_id} — return a single environment with its variables."""
    access = await resolve_workspace_access(db, username, workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if access.workspace_id is None:
        return create_response(404, error_message="Workspace not found")
    if not has_min_role(access, "viewer"):
        return create_response(403, error_message="Access denied")

    result = await db.execute(
        select(Environment).where(
            Environment.id == environment_id,
            Environment.workspace_id == workspace_id,
        )
    )
    environment = result.scalar_one_or_none()
    if not environment:
        return create_response(404, error_message="Environment not found")

    data = {
        "id": environment.id,
        "name": environment.name,
        "description": environment.description,
        "is_active": environment.is_active,
        "created_at": str(environment.created_at) if environment.created_at else None,
        "updated_at": str(environment.updated_at) if environment.updated_at else None,
        "workspace_id": environment.workspace_id,
        "variables": environment.variables.copy() if environment.variables else {},
    }
    return create_response(200, value_correction(data), EnvironmentResponse)


@router.put("/workspace/{workspace_id}/environments/{environment_id}")
async def update_environment(
    workspace_id: int,
    environment_id: int,
    environment_data: EnvironmentUpdate,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """PUT /environment/workspace/{workspace_id}/environments/{environment_id} — update environment name, description, or active flag; deactivate others when activating."""
    access = await resolve_workspace_access(db, username, workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if access.workspace_id is None:
        return create_response(404, error_message="Workspace not found")
    if not has_min_role(access, "editor"):
        return create_response(403, error_message="Editor access or higher required")

    result = await db.execute(
        select(Environment).where(
            Environment.id == environment_id,
            Environment.workspace_id == workspace_id,
        )
    )
    environment = result.scalar_one_or_none()
    if not environment:
        return create_response(404, error_message="Environment not found")

    if environment_data.name and environment_data.name != environment.name:
        conflict = (await db.execute(
            select(Environment.id).where(
                Environment.workspace_id == workspace_id,
                Environment.name == environment_data.name,
                Environment.id != environment_id,
            )
        )).scalar_one_or_none()
        if conflict is not None:
            return create_response(400, error_message=f"Environment name '{environment_data.name}' already exists in this workspace")

    if environment_data.is_active is True and not environment.is_active:
        await db.execute(
            update(Environment)
            .where(
                Environment.workspace_id == workspace_id,
                Environment.is_active == True,
                Environment.id != environment_id,
            )
            .values(is_active=False)
        )

    update_data: dict = {}
    if environment_data.name is not None:
        update_data["name"] = environment_data.name
    if environment_data.description is not None:
        update_data["description"] = environment_data.description
    if environment_data.is_active is not None:
        update_data["is_active"] = environment_data.is_active

    if update_data:
        await db.execute(
            update(Environment)
            .where(Environment.id == environment_id)
            .values(**update_data)
        )
        for k, v in update_data.items():
            setattr(environment, k, v)

    await write_audit(
        db,
        username=access.user.username,
        action="environment.update",
        entity_type="environment",
        entity_id=environment_id,
        workspace_id=workspace_id,
        metadata=update_data,
    )
    await db.commit()

    data = {
        "id": environment.id,
        "name": environment.name,
        "description": environment.description,
        "is_active": environment.is_active,
        "variables": environment.variables or {},
        "created_at": str(environment.created_at) if environment.created_at else None,
        "updated_at": str(environment.updated_at) if environment.updated_at else None,
        "workspace_id": environment.workspace_id,
    }
    return create_response(200, value_correction(data), EnvironmentResponse)


@router.post("/workspace/{workspace_id}/environments/{environment_id}/activate")
async def activate_environment(
    workspace_id: int,
    environment_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """POST /environment/workspace/{workspace_id}/environments/{environment_id}/activate — set this environment as active and deactivate all others in the workspace."""
    access = await resolve_workspace_access(db, username, workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if access.workspace_id is None:
        return create_response(404, error_message="Workspace not found")
    if not has_min_role(access, "editor"):
        return create_response(403, error_message="Editor access or higher required")

    result = await db.execute(
        select(Environment).where(
            Environment.id == environment_id,
            Environment.workspace_id == workspace_id,
        )
    )
    environment = result.scalar_one_or_none()
    if not environment:
        return create_response(404, error_message="Environment not found")

    await db.execute(
        update(Environment)
        .where(Environment.workspace_id == workspace_id, Environment.id != environment_id)
        .values(is_active=False)
    )
    await db.execute(
        update(Environment)
        .where(Environment.id == environment_id)
        .values(is_active=True)
    )
    environment.is_active = True

    await write_audit(
        db,
        username=access.user.username,
        action="environment.activate",
        entity_type="environment",
        entity_id=environment_id,
        workspace_id=workspace_id,
    )
    await db.commit()

    data = {
        "id": environment.id,
        "name": environment.name,
        "description": environment.description,
        "is_active": environment.is_active,
        "variables": environment.variables or {},
        "created_at": str(environment.created_at) if environment.created_at else None,
        "updated_at": str(environment.updated_at) if environment.updated_at else None,
        "workspace_id": environment.workspace_id,
    }
    return create_response(200, value_correction(data), EnvironmentResponse)


@router.delete("/workspace/{workspace_id}/environments/{environment_id}")
async def delete_environment(
    workspace_id: int,
    environment_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """DELETE /environment/workspace/{workspace_id}/environments/{environment_id} — permanently delete an environment and its JSON-stored variables."""
    access = await resolve_workspace_access(db, username, workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if access.workspace_id is None:
        return create_response(404, error_message="Workspace not found")
    if not has_min_role(access, "editor"):
        return create_response(403, error_message="Editor access or higher required")

    row = (await db.execute(
        select(Environment.id, Environment.name).where(
            Environment.id == environment_id,
            Environment.workspace_id == workspace_id,
        )
    )).first()
    if not row:
        return create_response(404, error_message="Environment not found")

    env_id, environment_name = row
    await db.execute(delete(Environment).where(Environment.id == env_id))
    await write_audit(
        db,
        username=access.user.username,
        action="environment.delete",
        entity_type="environment",
        entity_id=environment_id,
        workspace_id=workspace_id,
        metadata={"name": environment_name},
    )
    await db.commit()

    return create_response(200, value_correction({"message": f"Environment '{environment_name}' deleted successfully"}))
