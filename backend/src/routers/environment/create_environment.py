"""
What this file does: Exposes POST /environment/workspace/{workspace_id}/environments for creating a new environment within a workspace.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from models import Environment, Workspace
from schema import EnvironmentCreate, EnvironmentResponse
from config import get_db
from common_querys import get_user_by_username, can_access_workspace, write_audit
from utils import ExceptionHandler, create_response, value_correction

router = APIRouter()


@router.post("/workspace/{workspace_id}/environments")
async def create_environment(
    workspace_id: int,
    environment_data: EnvironmentCreate,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """POST /environment/workspace/{workspace_id}/environments — create a new environment; deactivate others when is_active is True."""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify workspace exists and user has at least editor access
        workspace_query = select(Workspace.id).where(Workspace.id == workspace_id)
        workspace_result = await db.execute(workspace_query)
        if workspace_result.scalar_one_or_none() is None:
            return create_response(404, error_message="Workspace not found")

        if not await can_access_workspace(db, workspace_id, user.id, min_role="editor"):
            return create_response(403, error_message="Editor access or higher required")

        # Check if environment name already exists in this workspace
        existing_env_query = select(Environment).where(
            Environment.workspace_id == workspace_id,
            Environment.name == environment_data.name
        )
        existing_env_result = await db.execute(existing_env_query)
        existing_env = existing_env_result.scalar_one_or_none()

        if existing_env:
            return create_response(400, error_message=f"Environment '{environment_data.name}' already exists in this workspace")

        # If this environment is set as active, deactivate others
        if environment_data.is_active:
            deactivate_query = (
                update(Environment)
                .where(
                    Environment.workspace_id == workspace_id,
                    Environment.is_active == True
                )
                .values(is_active=False)
            )
            await db.execute(deactivate_query)

        # Prepare variables (simple key-value format like save_variables.py)
        variables_dict = environment_data.variables or {}

        # Create the environment
        new_environment = Environment(
            workspace_id=workspace_id,
            name=environment_data.name,
            description=environment_data.description,
            is_active=environment_data.is_active,
            variables=variables_dict  # Direct assignment like save_variables.py
        )

        db.add(new_environment)
        await db.flush()

        await write_audit(db, username=user.username, action="environment.create", entity_type="environment", entity_id=new_environment.id, workspace_id=workspace_id, metadata={"name": new_environment.name})
        await db.commit()
        await db.refresh(new_environment)

        # Format response data (same simple format as save_variables.py)
        data = {
            "id": new_environment.id,
            "workspace_id": new_environment.workspace_id,
            "name": new_environment.name,
            "description": new_environment.description,
            "is_active": new_environment.is_active,
            "variables": new_environment.variables or {},  # Simple key-value format
            "created_at": str(new_environment.created_at),
            "updated_at": str(new_environment.updated_at)
        }

        return create_response(201, value_correction(data), EnvironmentResponse)
    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
