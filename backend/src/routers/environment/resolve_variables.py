# Variable Resolution for API Testing
from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Dict, Set
import re

from models import Environment, Workspace
from schema import VariableResolutionRequest
from config import get_db, get_user_by_username
from utils import ExceptionHandler, create_response, value_correction

router = APIRouter()


def extract_variables_from_text(text: str) -> Set[str]:
    """Extract variable names from text using {{variable_name}} pattern"""
    # Pattern to match {{variable_name}} - handles letters, numbers, underscores, hyphens
    pattern = r'\{\{([a-zA-Z_][a-zA-Z0-9_\-]*)\}\}'
    matches = re.findall(pattern, text)
    return set(matches)


def resolve_variables_in_text(text: str, variables: Dict[str, str]) -> str:
    """Replace {{variable_name}} patterns with actual values"""
    def replace_variable(match: re.Match[str]) -> str:
        var_name = match.group(1)
        return variables.get(var_name, match.group(0))  # Keep original if not found

    pattern = r'\{\{([a-zA-Z_][a-zA-Z0-9_\-]*)\}\}'
    return re.sub(pattern, replace_variable, text)


@router.get("/workspace/{workspace_id}/environments/active/variables")
async def get_active_environment_variables(
    workspace_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Get variables from the active environment in a workspace"""
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

        # Get active environment
        active_env_query = select(Environment).where(
            Environment.workspace_id == workspace_id,
            Environment.is_active == True
        )
        active_env_result = await db.execute(active_env_query)
        active_environment = active_env_result.scalar_one_or_none()

        if not active_environment:
            data = {
                "variables": {},
                "environment_name": None,
                "environment_id": None,
                "resolved_count": 0
            }
            return create_response(200, value_correction(data))

        # Get all enabled variables from active environment
        variables_dict = {}
        if active_environment.variables:
            # Simple key-value format
            variables_dict = active_environment.variables.copy()

        data = {
            "variables": variables_dict,
            "environment_name": active_environment.name,
            "environment_id": active_environment.id,
            "resolved_count": len(variables_dict)
        }

        return create_response(200, value_correction(data))

    except Exception as e:
        ExceptionHandler(e)


@router.get("/workspace/{workspace_id}/environments/{environment_id}/variables/resolved")
async def get_environment_variables_resolved(
    workspace_id: int,
    environment_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Get variables from a specific environment"""
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

        # Get specific environment
        environment_query = select(Environment).where(
            Environment.id == environment_id,
            Environment.workspace_id == workspace_id
        )
        environment_result = await db.execute(environment_query)
        environment = environment_result.scalar_one_or_none()

        if not environment:
            return create_response(206, error_message="Environment not found")

        # Get all enabled variables from environment
        variables_dict = {}
        if environment.variables:
            # Simple key-value format
            variables_dict = environment.variables.copy()

        data = {
            "variables": variables_dict,
            "environment_name": environment.name,
            "environment_id": environment.id,
            "resolved_count": len(variables_dict)
        }

        return create_response(200, value_correction(data))

    except Exception as e:
        ExceptionHandler(e)


@router.post("/workspace/{workspace_id}/environments/resolve")
async def resolve_variables_in_request(
    workspace_id: int,
    resolution_request: VariableResolutionRequest,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Resolve variables in text using active environment or specified environment"""
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

        # Determine which environment to use
        environment = None
        if resolution_request.environment_id:
            # Use specific environment
            environment_query = select(Environment).where(
                Environment.id == resolution_request.environment_id,
                Environment.workspace_id == workspace_id
            )
            environment_result = await db.execute(environment_query)
            environment = environment_result.scalar_one_or_none()

            if not environment:
                return create_response(206, error_message="Specified environment not found")
        else:
            # Use active environment
            active_env_query = select(Environment).where(
                Environment.workspace_id == workspace_id,
                Environment.is_active == True
            )
            active_env_result = await db.execute(active_env_query)
            environment = active_env_result.scalar_one_or_none()

        # Extract variables from the text
        variables_found = list(extract_variables_from_text(resolution_request.text))

        if not environment:
            # No environment available
            data = {
                "original_text": resolution_request.text,
                "resolved_text": resolution_request.text,
                "variables_found": variables_found,
                "variables_resolved": [],
                "variables_missing": variables_found,
                "environment_used": None
            }
            return create_response(200, value_correction(data))

        # Get environment variables
        variables_dict = {}
        if environment.variables:
            # Simple key-value format
            variables_dict = environment.variables.copy()

        # Determine which variables were resolved and which are missing
        variables_resolved = []
        variables_missing = []

        for var_name in variables_found:
            if var_name in variables_dict:
                variables_resolved.append(var_name)
            else:
                variables_missing.append(var_name)

        # Resolve variables in the text
        resolved_text = resolve_variables_in_text(resolution_request.text, variables_dict)

        data = {
            "original_text": resolution_request.text,
            "resolved_text": resolved_text,
            "variables_found": variables_found,
            "variables_resolved": variables_resolved,
            "variables_missing": variables_missing,
            "environment_used": environment.name
        }

        return create_response(200, value_correction(data))

    except Exception as e:
        return create_response(500, error_message=f"Failed to resolve variables: {str(e)}")


@router.post("/workspace/{workspace_id}/environments/{environment_id}/resolve")
async def resolve_variables_with_specific_environment(
    workspace_id: int,
    environment_id: int,
    resolution_request: VariableResolutionRequest,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Resolve variables in text using a specific environment"""
    try:
        # Override the environment_id in the request
        resolution_request.environment_id = environment_id

        return await resolve_variables_in_request(
            workspace_id,
            resolution_request,
            username,
            db
        )

    except Exception as e:
        ExceptionHandler(e)
