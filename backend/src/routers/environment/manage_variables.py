# Environment Variable Management
from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from models import Environment, Workspace
from schema import EnvironmentVariableCreate, EnvironmentVariableUpdate
from config import get_db, get_user_by_username
from utils import ExceptionHandler, create_response, value_correction

router = APIRouter()


@router.post("/workspace/{workspace_id}/environments/{environment_id}/variables")
async def create_environment_variable(
    workspace_id: int,
    environment_id: int,
    variable_data: EnvironmentVariableCreate,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Create a new environment variable"""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify workspace and environment exist and user has access
        workspace_query = select(Workspace).where(
            Workspace.id == workspace_id,
            Workspace.user_id == user.id
        )
        workspace_result = await db.execute(workspace_query)
        workspace = workspace_result.scalar_one_or_none()

        if not workspace:
            return create_response(206, error_message="Workspace not found or access denied")

        # Verify environment exists in this workspace
        environment_query = select(Environment).where(
            Environment.id == environment_id,
            Environment.workspace_id == workspace_id
        )
        environment_result = await db.execute(environment_query)
        environment = environment_result.scalar_one_or_none()

        if not environment:
            return create_response(206, error_message="Environment not found")

        # Check if variable key already exists
        current_variables = environment.variables or {}
        if variable_data.key in current_variables:
            return create_response(400, error_message=f"Variable key '{variable_data.key}' already exists in this environment")

        # Add new variable to JSON
        new_variable_data = {
            "value": variable_data.value,
            "description": variable_data.description,
            "is_enabled": variable_data.is_enabled,
            "is_secret": variable_data.is_secret
        }

        current_variables[variable_data.key] = new_variable_data

        # Update environment with new variables
        update_query = (
            update(Environment)
            .where(Environment.id == environment_id)
            .values(variables=current_variables)
        )
        await db.execute(update_query)
        await db.commit()

        # Prepare response data with masked secret
        response_data = new_variable_data.copy()
        if new_variable_data.get('is_secret', False) and new_variable_data.get('value'):
            response_data['value'] = "***"

        data = {
            "key": variable_data.key,
            "value": response_data['value'],
            "description": response_data['description'],
            "is_enabled": response_data['is_enabled'],
            "is_secret": response_data['is_secret'],
            "environment_id": environment_id
        }

        return create_response(201, value_correction(data))

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)


@router.get("/workspace/{workspace_id}/environments/{environment_id}/variables")
async def list_environment_variables(
    workspace_id: int,
    environment_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """List all variables in an environment"""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify workspace and environment exist and user has access
        workspace_query = select(Workspace).where(
            Workspace.id == workspace_id,
            Workspace.user_id == user.id
        )
        workspace_result = await db.execute(workspace_query)
        workspace = workspace_result.scalar_one_or_none()

        if not workspace:
            return create_response(206, error_message="Workspace not found or access denied")

        # Verify environment exists in this workspace
        environment_query = select(Environment).where(
            Environment.id == environment_id,
            Environment.workspace_id == workspace_id
        )
        environment_result = await db.execute(environment_query)
        environment = environment_result.scalar_one_or_none()

        if not environment:
            return create_response(206, error_message="Environment not found")

        # Get variables with masked secrets
        masked_variables = {}
        if environment.variables:
            for key, var_data in environment.variables.items():
                masked_var = var_data.copy()
                if var_data.get('is_secret', False) and var_data.get('value'):
                    masked_var['value'] = "***"
                masked_variables[key] = masked_var

        data = {
            "environment_id": environment_id,
            "variables": masked_variables,
            "total_count": len(masked_variables)
        }

        return create_response(200, value_correction(data))

    except Exception as e:
        ExceptionHandler(e)


@router.get("/workspace/{workspace_id}/environments/{environment_id}/variables/{variable_key}")
async def get_environment_variable(
    workspace_id: int,
    environment_id: int,
    variable_key: str,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific environment variable"""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify workspace and environment exist and user has access
        workspace_query = select(Workspace).where(
            Workspace.id == workspace_id,
            Workspace.user_id == user.id
        )
        workspace_result = await db.execute(workspace_query)
        workspace = workspace_result.scalar_one_or_none()

        if not workspace:
            return create_response(206, error_message="Workspace not found or access denied")

        # Verify environment exists in this workspace
        environment_query = select(Environment).where(
            Environment.id == environment_id,
            Environment.workspace_id == workspace_id
        )
        environment_result = await db.execute(environment_query)
        environment = environment_result.scalar_one_or_none()

        if not environment:
            return create_response(206, error_message="Environment not found")

        # Get the variable
        current_variables = environment.variables or {}
        if variable_key not in current_variables:
            return create_response(206, error_message="Environment variable not found")

        var_data = current_variables[variable_key].copy()
        if var_data.get('is_secret', False) and var_data.get('value'):
            var_data['value'] = "***"

        data = {
            "key": variable_key,
            "value": var_data['value'],
            "description": var_data['description'],
            "is_enabled": var_data['is_enabled'],
            "is_secret": var_data['is_secret'],
            "environment_id": environment_id
        }

        return create_response(200, value_correction(data))

    except Exception as e:
        ExceptionHandler(e)


@router.put("/workspace/{workspace_id}/environments/{environment_id}/variables/{variable_key}")
async def update_environment_variable(
    workspace_id: int,
    environment_id: int,
    variable_key: str,
    variable_data: EnvironmentVariableUpdate,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Update an environment variable"""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify workspace and environment exist and user has access
        workspace_query = select(Workspace).where(
            Workspace.id == workspace_id,
            Workspace.user_id == user.id
        )
        workspace_result = await db.execute(workspace_query)
        workspace = workspace_result.scalar_one_or_none()

        if not workspace:
            return create_response(206, error_message="Workspace not found or access denied")

        # Verify environment exists in this workspace
        environment_query = select(Environment).where(
            Environment.id == environment_id,
            Environment.workspace_id == workspace_id
        )
        environment_result = await db.execute(environment_query)
        environment = environment_result.scalar_one_or_none()

        if not environment:
            return create_response(206, error_message="Environment not found")

        # Get current variables
        current_variables = environment.variables or {}
        if variable_key not in current_variables:
            return create_response(206, error_message="Environment variable not found")

        # Check if new key conflicts with existing variables
        if variable_data.key and variable_data.key != variable_key:
            if variable_data.key in current_variables:
                return create_response(400, error_message=f"Variable key '{variable_data.key}' already exists in this environment")

        # Update variable data
        var_data = current_variables[variable_key].copy()

        if variable_data.value is not None:
            var_data["value"] = variable_data.value
        if variable_data.description is not None:
            var_data["description"] = variable_data.description
        if variable_data.is_enabled is not None:
            var_data["is_enabled"] = variable_data.is_enabled
        if variable_data.is_secret is not None:
            var_data["is_secret"] = variable_data.is_secret

        # Handle key change
        if variable_data.key and variable_data.key != variable_key:
            # Remove old key and add new key
            del current_variables[variable_key]
            current_variables[variable_data.key] = var_data
            response_key = variable_data.key
        else:
            current_variables[variable_key] = var_data
            response_key = variable_key

        # Update environment
        update_query = (
            update(Environment)
            .where(Environment.id == environment_id)
            .values(variables=current_variables)
        )
        await db.execute(update_query)
        await db.commit()

        # Prepare response with masked secret
        response_var_data = var_data.copy()
        if var_data.get('is_secret', False) and var_data.get('value'):
            response_var_data['value'] = "***"

        data = {
            "key": response_key,
            "value": response_var_data['value'],
            "description": response_var_data['description'],
            "is_enabled": response_var_data['is_enabled'],
            "is_secret": response_var_data['is_secret'],
            "environment_id": environment_id
        }

        return create_response(200, value_correction(data))

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)


@router.delete("/workspace/{workspace_id}/environments/{environment_id}/variables/{variable_key}")
async def delete_environment_variable(
    workspace_id: int,
    environment_id: int,
    variable_key: str,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Delete an environment variable"""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify workspace and environment exist and user has access
        workspace_query = select(Workspace).where(
            Workspace.id == workspace_id,
            Workspace.user_id == user.id
        )
        workspace_result = await db.execute(workspace_query)
        workspace = workspace_result.scalar_one_or_none()

        if not workspace:
            return create_response(206, error_message="Workspace not found or access denied")

        # Verify environment exists in this workspace
        environment_query = select(Environment).where(
            Environment.id == environment_id,
            Environment.workspace_id == workspace_id
        )
        environment_result = await db.execute(environment_query)
        environment = environment_result.scalar_one_or_none()

        if not environment:
            return create_response(206, error_message="Environment not found")

        # Get current variables
        current_variables = environment.variables or {}
        if variable_key not in current_variables:
            return create_response(206, error_message="Environment variable not found")

        # Remove variable
        del current_variables[variable_key]

        # Update environment
        update_query = (
            update(Environment)
            .where(Environment.id == environment_id)
            .values(variables=current_variables)
        )
        await db.execute(update_query)
        await db.commit()

        data = {
            "message": f"Environment variable '{variable_key}' deleted successfully"
        }

        return create_response(200, value_correction(data))

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)
