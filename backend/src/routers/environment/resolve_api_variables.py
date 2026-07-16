"""
What this file does: Exposes POST routes for resolving {{variable}} placeholders across all fields of a complete API data structure.
"""

from fastapi import APIRouter, Depends, Header as FastAPIHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from config import get_db
from common_querys import resolve_workspace_access, has_min_role
from models import Environment
from schema import ApiDataResolveResponse
from utils import get_variables_from_api_data, create_response, value_correction, resolve_variables

router = APIRouter()


class ApiDataResolveRequest(BaseModel):
    """Request body for resolving {{variable}} placeholders in a complete API data structure.
    Attributes:
        api_data: Full API data dict (url, method, headers, body, params, expected) containing placeholders.
        environment_id: Environment to resolve from; required — active environment lookup not yet implemented.
    """
    api_data: Dict[str, Any] = Field(..., description="Complete API data with potential variables")
    environment_id: Optional[int] = Field(None, description="Specific environment ID (uses active if not provided)")

    class Config:
        schema_extra = {
            "example": {
                "api_data": {
                    "url": "{{BASE_URL}}/api/users/{{USER_ID}}",
                    "method": "GET",
                    "headers": {
                        "Authorization": "Bearer {{API_TOKEN}}",
                        "Content-Type": "application/json"
                    },
                    "body": {
                        "name": "{{USER_NAME}}",
                        "email": "{{USER_EMAIL}}"
                    },
                    "params": {
                        "limit": "{{PAGE_LIMIT}}",
                        "offset": "{{PAGE_OFFSET}}"
                    },
                    "expected": {
                        "status": 200,
                        "response": {
                            "user_id": "{{USER_ID}}"
                        }
                    }
                },
                "environment_id": 1
            }
        }


@router.post("/workspace/{workspace_id}/environments/resolve-api")
async def resolve_api_data_variables(
    workspace_id: int,
    request_data: ApiDataResolveRequest,
    username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db)
):
    """POST /environment/workspace/{workspace_id}/environments/resolve-api — substitute {{variable}} placeholders in all fields of api_data using the specified environment."""
    access = await resolve_workspace_access(db, username, workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if access.workspace_id is None:
        return create_response(404, error_message="Workspace not found")
    if not has_min_role(access, "viewer"):
        return create_response(403, error_message="Access denied")

    variables_found: List[str] = list(get_variables_from_api_data(request_data.api_data))

    if not request_data.environment_id:
        return create_response(400, error_message="environment_id is required")

    # Verify the environment belongs to this workspace and fetch variables in one query.
    env_row = (await db.execute(
        select(Environment.id, Environment.variables).where(
            Environment.id == request_data.environment_id,
            Environment.workspace_id == workspace_id,
        )
    )).first()
    if env_row is None:
        return create_response(404, error_message="Environment not found in this workspace")

    env_variables: Dict[str, Any] = env_row.variables or {}
    resolved_api_data = resolve_variables(request_data.api_data, env_variables)

    variables_resolved = [v for v in variables_found if v in env_variables]
    variables_missing = [v for v in variables_found if v not in env_variables]

    data = {
        "original_api_data": request_data.api_data,
        "resolved_api_data": resolved_api_data,
        "variables_found": variables_found,
        "variables_resolved": variables_resolved,
        "variables_missing": variables_missing,
        "total_variables": len(variables_found),
        "resolved_count": len(variables_resolved),
        "missing_count": len(variables_missing),
    }
    return create_response(200, value_correction(data), ApiDataResolveResponse)


@router.post("/workspace/{workspace_id}/environments/{environment_id}/resolve-api")
async def resolve_api_data_with_specific_environment(
    workspace_id: int,
    environment_id: int,
    request_data: ApiDataResolveRequest,
    username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db)
):
    """POST /environment/workspace/{workspace_id}/environments/{environment_id}/resolve-api — inject environment_id into request and delegate to resolve_api_data_variables."""
    request_data.environment_id = environment_id
    return await resolve_api_data_variables(workspace_id, request_data, username, db)
