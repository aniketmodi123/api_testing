from fastapi import APIRouter, Depends, Header as FastAPIHeader, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field

from config import get_db, get_user_by_username
from utils import resolve_api_variables, get_variables_from_api_data, get_environment_variables, ExceptionHandler, create_response, value_correction

router = APIRouter()


class ApiDataResolveRequest(BaseModel):
    """Schema for API data variable resolution"""
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
    """
    Resolve variables in complete API data structure

    This function takes any API data (url, body, headers, params, expected, etc.)
    and replaces all {{variable_name}} patterns with actual values from the environment.
    """
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Extract variables found in the API data
        variables_found = list(get_variables_from_api_data(request_data.api_data))

        # Resolve variables in API data
        if request_data.environment_id:
            environment_id = request_data.environment_id
        else:
            # You'll need to implement logic to get active environment
            # For now, we'll require environment_id to be provided
            raise HTTPException(
                status_code=400,
                detail="environment_id is required"
            )

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
        ExceptionHandler(e)


@router.post("/workspace/{workspace_id}/environments/{environment_id}/resolve-api")
async def resolve_api_data_with_specific_environment(
    workspace_id: int,
    environment_id: int,
    request_data: ApiDataResolveRequest,
    username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Resolve variables in API data using a specific environment
    """
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
        ExceptionHandler(e)
