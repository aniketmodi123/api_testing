# Create Environment endpoint
from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from models import Environment, Workspace
from schema import EnvironmentCreate
from config import get_db, get_user_by_username
from utils import ExceptionHandler, create_response, value_correction

router = APIRouter()


@router.post("/workspace/{workspace_id}/environments")
async def create_environment(
    workspace_id: int,
    environment_data: EnvironmentCreate,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Create a new environment in a workspace"""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify workspace exists and user has access
        workspace_query = select(Workspace).where(
            Workspace.id == workspace_id,
            Workspace.user_id == user.id
        )
        workspace_result = await db.execute(workspace_query)
        workspace = workspace_result.scalar_one_or_none()

        if not workspace:
            return create_response(206, error_message="Workspace not found or access denied")

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

        # Prepare variables JSON
        variables_json = {}
        if environment_data.variables:
            for key, var_data in environment_data.variables.items():
                variables_json[key] = {
                    "value": var_data.value,
                    "description": var_data.description,
                    "is_enabled": var_data.is_enabled
                }

        # Create the environment
        new_environment = Environment(
            workspace_id=workspace_id,
            name=environment_data.name,
            description=environment_data.description,
            is_active=environment_data.is_active,
            variables=variables_json
        )

        db.add(new_environment)
        await db.commit()
        await db.refresh(new_environment)

        # Format response data with masked secrets
        masked_variables = {}
        if new_environment.variables:
            for key, var_data in new_environment.variables.items():
                masked_var = var_data.copy()
                masked_variables[key] = masked_var

        data = {
            "id": new_environment.id,
            "workspace_id": new_environment.workspace_id,
            "name": new_environment.name,
            "description": new_environment.description,
            "is_active": new_environment.is_active,
            "variables": masked_variables,
            "created_at": str(new_environment.created_at),
            "updated_at": str(new_environment.updated_at)
        }

        return create_response(201, value_correction(data))
    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)
