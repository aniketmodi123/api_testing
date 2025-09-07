# List and manage environments
from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete

from models import Environment, Workspace
from schema import EnvironmentUpdate
from config import get_db, get_user_by_username
from utils import ExceptionHandler, create_response, value_correction

router = APIRouter()


@router.get("/workspace/{workspace_id}/environments")
async def list_environments(
    workspace_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """List all environments in a workspace"""
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

        # Get all environments for this workspace
        environments_query = select(Environment).where(
            Environment.workspace_id == workspace_id
        ).order_by(Environment.created_at.desc())

        environments_result = await db.execute(environments_query)
        environments = environments_result.scalars().all()

        # Find active environment
        active_environment = None
        for env in environments:
            if env.is_active:
                active_environment = env
                break

        data = {
            "environments": [
                {
                    "id": env.id,
                    "name": env.name,
                    "description": env.description,
                    "is_active": env.is_active,
                    "created_at": str(env.created_at) if env.created_at else None,
                    "updated_at": str(env.updated_at) if env.updated_at else None,
                    "workspace_id": env.workspace_id
                } for env in environments
            ],
            "total_count": len(environments),
            "active_environment": {
                "id": active_environment.id,
                "name": active_environment.name,
                "description": active_environment.description,
                "is_active": active_environment.is_active,
                "created_at": str(active_environment.created_at) if active_environment.created_at else None,
                "updated_at": str(active_environment.updated_at) if active_environment.updated_at else None,
                "workspace_id": active_environment.workspace_id
            } if active_environment else None
        }

        return create_response(200, value_correction(data))

    except Exception as e:
        ExceptionHandler(e)


@router.get("/workspace/{workspace_id}/environments/{environment_id}")
async def get_environment(
    workspace_id: int,
    environment_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific environment with its variables"""
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

        # Get the environment
        environment_query = select(Environment).where(
            Environment.id == environment_id,
            Environment.workspace_id == workspace_id
        )
        environment_result = await db.execute(environment_query)
        environment = environment_result.scalar_one_or_none()

        if not environment:
            return create_response(206, error_message="Environment not found")

        # Get environment variables
        masked_variables = {}
        if environment.variables:
            for key, var_data in environment.variables.items():
                masked_var = var_data.copy()
                masked_variables[key] = masked_var

        data = {
            "id": environment.id,
            "name": environment.name,
            "description": environment.description,
            "is_active": environment.is_active,
            "created_at": str(environment.created_at) if environment.created_at else None,
            "updated_at": str(environment.updated_at) if environment.updated_at else None,
            "workspace_id": environment.workspace_id,
            "variables": masked_variables
        }

        return create_response(200, value_correction(data))

    except Exception as e:
        ExceptionHandler(e)


@router.put("/workspace/{workspace_id}/environments/{environment_id}")
async def update_environment(
    workspace_id: int,
    environment_id: int,
    environment_data: EnvironmentUpdate,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Update an environment"""
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

        # Get the environment
        environment_query = select(Environment).where(
            Environment.id == environment_id,
            Environment.workspace_id == workspace_id
        )
        environment_result = await db.execute(environment_query)
        environment = environment_result.scalar_one_or_none()

        if not environment:
            return create_response(206, error_message="Environment not found")

        # Check if new name conflicts with existing environments
        if environment_data.name and environment_data.name != environment.name:
            existing_env_query = select(Environment).where(
                Environment.workspace_id == workspace_id,
                Environment.name == environment_data.name,
                Environment.id != environment_id
            )
            existing_env_result = await db.execute(existing_env_query)
            existing_env = existing_env_result.scalar_one_or_none()

            if existing_env:
                return create_response(400, error_message=f"Environment name '{environment_data.name}' already exists in this workspace")

        # If setting this environment as active, deactivate others
        if environment_data.is_active is True and not environment.is_active:
            deactivate_query = (
                update(Environment)
                .where(
                    Environment.workspace_id == workspace_id,
                    Environment.is_active == True,
                    Environment.id != environment_id
                )
                .values(is_active=False)
            )
            await db.execute(deactivate_query)

        # Update environment fields
        update_data = {}
        if environment_data.name is not None:
            update_data["name"] = environment_data.name
        if environment_data.description is not None:
            update_data["description"] = environment_data.description
        if environment_data.is_active is not None:
            update_data["is_active"] = environment_data.is_active

        if update_data:
            update_query = (
                update(Environment)
                .where(Environment.id == environment_id)
                .values(**update_data)
            )
            await db.execute(update_query)

        await db.commit()

        # Refresh and return updated environment
        await db.refresh(environment)

        data = {
            "id": environment.id,
            "name": environment.name,
            "description": environment.description,
            "is_active": environment.is_active,
            "created_at": str(environment.created_at) if environment.created_at else None,
            "updated_at": str(environment.updated_at) if environment.updated_at else None,
            "workspace_id": environment.workspace_id
        }

        return create_response(200, value_correction(data))

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)


@router.post("/workspace/{workspace_id}/environments/{environment_id}/activate")
async def activate_environment(
    workspace_id: int,
    environment_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Set an environment as the active one for the workspace"""
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

        # Get the environment
        environment_query = select(Environment).where(
            Environment.id == environment_id,
            Environment.workspace_id == workspace_id
        )
        environment_result = await db.execute(environment_query)
        environment = environment_result.scalar_one_or_none()

        if not environment:
            return create_response(206, error_message="Environment not found")

        # Deactivate all other environments in this workspace
        deactivate_query = (
            update(Environment)
            .where(
                Environment.workspace_id == workspace_id,
                Environment.id != environment_id
            )
            .values(is_active=False)
        )
        await db.execute(deactivate_query)

        # Activate the target environment
        activate_query = (
            update(Environment)
            .where(Environment.id == environment_id)
            .values(is_active=True)
        )
        await db.execute(activate_query)

        await db.commit()

        # Refresh and return updated environment
        await db.refresh(environment)

        data = {
            "id": environment.id,
            "name": environment.name,
            "description": environment.description,
            "is_active": environment.is_active,
            "created_at": str(environment.created_at) if environment.created_at else None,
            "updated_at": str(environment.updated_at) if environment.updated_at else None,
            "workspace_id": environment.workspace_id
        }

        return create_response(200, value_correction(data))

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)


@router.delete("/workspace/{workspace_id}/environments/{environment_id}")
async def delete_environment(
    workspace_id: int,
    environment_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Delete an environment and all its variables"""
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

        # Get the environment
        environment_query = select(Environment).where(
            Environment.id == environment_id,
            Environment.workspace_id == workspace_id
        )
        environment_result = await db.execute(environment_query)
        environment = environment_result.scalar_one_or_none()

        if not environment:
            return create_response(206, error_message="Environment not found")

        environment_name = environment.name

        # Delete the environment (variables are stored as JSON, so they're deleted automatically)
        delete_env_query = delete(Environment).where(
            Environment.id == environment_id
        )
        await db.execute(delete_env_query)

        await db.commit()

        data = {
            "message": f"Environment '{environment_name}' deleted successfully"
        }

        return create_response(200, value_correction(data))

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)
