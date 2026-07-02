"""
What this file does: Exposes POST routes for resolving {{variable}} placeholders across all fields of a complete API data structure.
"""

from fastapi import APIRouter, Depends, Header as FastAPIHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field

from config import get_db
from common_querys import get_user_by_username, can_access_workspace
from models import Environment, Workspace
from utils import resolve_api_variables, get_variables_from_api_data, ExceptionHandler, create_response, value_correction, get_environment_variables

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
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify workspace exists and user has at least viewer access
        workspace_result = await db.execute(select(Workspace.id).where(Workspace.id == workspace_id))
        if workspace_result.scalar_one_or_none() is None:
            return create_response(404, error_message="Workspace not found")

        if not await can_access_workspace(db, workspace_id, user.id, min_role="viewer"):
            return create_response(403, error_message="Access denied")

        # Extract variables found in the API data
        variables_found = list(get_variables_from_api_data(request_data.api_data))

        if not request_data.environment_id:
            return create_response(400, error_message="environment_id is required")

        # Verify the environment belongs to this workspace (prevents resolving another
        # workspace's variables by passing an arbitrary environment_id)
        environment_id = request_data.environment_id
        env_check = await db.execute(
            select(Environment.id).where(
                Environment.id == environment_id,
                Environment.workspace_id == workspace_id
            )
        )
        if env_check.scalar_one_or_none() is None:
            return create_response(404, error_message="Environment not found in this workspace")

        resolved_api_data = await resolve_api_variables(
            environment_id=environment_id,
            api_data=request_data.api_data
        )

        # Get environment variables to determine which were resolved
        environment_variables = await get_environment_variables(environment_id)

        # Determine resolved and missing variables
        variables_resolved = [var for var in variables_found if var in environment_variables]
        variables_missing = [var for var in variables_found if var not in environment_variables]

        data = {
            "original_api_data": request_data.api_data,
            "resolved_api_data": resolved_api_data,
            "variables_found": variables_found,
            "variables_resolved": variables_resolved,
            "variables_missing": variables_missing,
            "total_variables": len(variables_found),
            "resolved_count": len(variables_resolved),
            "missing_count": len(variables_missing)
        }

        return create_response(200, value_correction(data))

    except Exception as e:
        return ExceptionHandler(e)


@router.post("/workspace/{workspace_id}/environments/{environment_id}/resolve-api")
async def resolve_api_data_with_specific_environment(
    workspace_id: int,
    environment_id: int,
    request_data: ApiDataResolveRequest,
    username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db)
):
    """POST /environment/workspace/{workspace_id}/environments/{environment_id}/resolve-api — inject environment_id into request and delegate to resolve_api_data_variables."""
    try:
        # Override environment_id in request
        request_data.environment_id = environment_id

        return await resolve_api_data_variables(
            workspace_id,
            request_data,
            username,
            db
        )

    except Exception as e:
        return ExceptionHandler(e)
