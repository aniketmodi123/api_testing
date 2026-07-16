"""
What this file does: Exposes routes for resolving {{variable}} placeholders in text using active or specified environment variables.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Any, Dict, Set
import re

from models import Environment
from routers.runner.runner import resolve_variables
from schema import VariableResolutionRequest, ResolvedVariables, VariableResolutionResponse
from common_querys import resolve_workspace_access, has_min_role
from config import get_db
from utils import create_response, value_correction

router = APIRouter()


def extract_variables_from_text(text: str) -> Set[str]:
    """
    What it does: Return all unique {{variable_name}} placeholders found in the text.
    Args:
        text: Input string to scan; empty string returns an empty set.
    Returns:
        set[str]: Variable names without the surrounding braces; empty set when none are found.
    """
    pattern = r'\{\{([a-zA-Z_][a-zA-Z0-9_\-]*)\}\}'
    matches = re.findall(pattern, text)
    return set(matches)


@router.get("/workspace/{workspace_id}/environments/active/variables")
async def get_active_environment_variables(
    workspace_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """GET /environment/workspace/{workspace_id}/environments/active/variables — return variables from the currently active environment; returns empty dict when none is active."""
    access = await resolve_workspace_access(db, username, workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if access.workspace_id is None:
        return create_response(404, error_message="Workspace not found")
    if not has_min_role(access, "viewer"):
        return create_response(403, error_message="Access denied")

    row = (await db.execute(
        select(Environment.id, Environment.name, Environment.variables).where(
            Environment.workspace_id == workspace_id,
            Environment.is_active == True,
        )
    )).first()

    if not row:
        data: Dict[str, Any] = {
            "variables": {},
            "environment_name": None,
            "environment_id": None,
            "resolved_count": 0,
        }
        return create_response(200, value_correction(data), ResolvedVariables)

    env_id, env_name, env_variables = row
    variables_dict: Dict[str, Any] = env_variables.copy() if env_variables else {}
    data = {
        "variables": variables_dict,
        "environment_name": env_name,
        "environment_id": env_id,
        "resolved_count": len(variables_dict),
    }
    return create_response(200, value_correction(data), ResolvedVariables)


@router.get("/workspace/{workspace_id}/environments/{environment_id}/variables/resolved")
async def get_environment_variables_resolved(
    workspace_id: int,
    environment_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """GET /environment/workspace/{workspace_id}/environments/{environment_id}/variables/resolved — return the key-value variables for a specific environment."""
    access = await resolve_workspace_access(db, username, workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if access.workspace_id is None:
        return create_response(404, error_message="Workspace not found")
    if not has_min_role(access, "viewer"):
        return create_response(403, error_message="Access denied")

    row = (await db.execute(
        select(Environment.id, Environment.name, Environment.variables).where(
            Environment.id == environment_id,
            Environment.workspace_id == workspace_id,
        )
    )).first()
    if not row:
        return create_response(404, error_message="Environment not found")

    env_id, env_name, env_variables = row
    variables_dict: Dict[str, Any] = env_variables.copy() if env_variables else {}
    data: Dict[str, Any] = {
        "variables": variables_dict,
        "environment_name": env_name,
        "environment_id": env_id,
        "resolved_count": len(variables_dict),
    }
    return create_response(200, value_correction(data), ResolvedVariables)


@router.post("/workspace/{workspace_id}/environments/resolve")
async def resolve_variables_in_request(
    workspace_id: int,
    resolution_request: VariableResolutionRequest,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """POST /environment/workspace/{workspace_id}/environments/resolve — substitute {{variable}} placeholders in text using the specified or active environment."""
    access = await resolve_workspace_access(db, username, workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if access.workspace_id is None:
        return create_response(404, error_message="Workspace not found")
    if not has_min_role(access, "viewer"):
        return create_response(403, error_message="Access denied")

    if resolution_request.environment_id:
        env_stmt = select(Environment.id, Environment.name, Environment.variables).where(
            Environment.id == resolution_request.environment_id,
            Environment.workspace_id == workspace_id,
        )
    else:
        env_stmt = select(Environment.id, Environment.name, Environment.variables).where(
            Environment.workspace_id == workspace_id,
            Environment.is_active == True,
        )
    row = (await db.execute(env_stmt)).first()

    variables_found = list(extract_variables_from_text(resolution_request.text))

    if not row:
        if resolution_request.environment_id:
            return create_response(404, error_message="Specified environment not found")
        data: Dict[str, Any] = {
            "original_text": resolution_request.text,
            "resolved_text": resolution_request.text,
            "variables_found": variables_found,
            "variables_resolved": [],
            "variables_missing": variables_found,
            "environment_used": None,
        }
        return create_response(200, value_correction(data), VariableResolutionResponse)

    _, env_name, env_variables = row
    variables_dict: Dict[str, Any] = env_variables.copy() if env_variables else {}

    variables_resolved = [v for v in variables_found if v in variables_dict]
    variables_missing = [v for v in variables_found if v not in variables_dict]
    resolved_text = resolve_variables(resolution_request.text, variables_dict)

    data = {
        "original_text": resolution_request.text,
        "resolved_text": resolved_text,
        "variables_found": variables_found,
        "variables_resolved": variables_resolved,
        "variables_missing": variables_missing,
        "environment_used": env_name,
    }
    return create_response(200, value_correction(data), VariableResolutionResponse)


@router.post("/workspace/{workspace_id}/environments/{environment_id}/resolve")
async def resolve_variables_with_specific_environment(
    workspace_id: int,
    environment_id: int,
    resolution_request: VariableResolutionRequest,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """POST /environment/workspace/{workspace_id}/environments/{environment_id}/resolve — resolve {{variable}} placeholders using the specified environment by delegating to resolve_variables_in_request."""
    resolution_request.environment_id = environment_id
    return await resolve_variables_in_request(workspace_id, resolution_request, username, db)
