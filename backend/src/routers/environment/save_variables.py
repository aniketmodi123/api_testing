"""
What this file does: Exposes POST /environment/workspace/{workspace_id}/environments/{environment_id}/variables for setting environment variables.
"""

from fastapi import APIRouter, Depends, Header as FastAPIHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from common_querys import get_user_by_username, can_access_workspace
from config import get_db
from models import Environment, Workspace
from schema import (
    VariablesSetRequest,
    VariablesResponse
)
from utils import (
    ExceptionHandler,
    create_response,
    value_correction
)

router = APIRouter()


@router.post("/workspace/{workspace_id}/environments/{environment_id}/variables")
async def save_environment_variables(
    workspace_id: int,
    environment_id: int,
    variables_data: VariablesSetRequest,
    username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db)
):
    """POST /environment/workspace/{workspace_id}/environments/{environment_id}/variables — overwrite the environment's key-value variables; returns 201 on first save, 200 on update."""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify workspace exists and user has at least editor access
        workspace_result = await db.execute(select(Workspace.id).where(Workspace.id == workspace_id))
        if workspace_result.scalar_one_or_none() is None:
            return create_response(404, error_message="Workspace not found")

        if not await can_access_workspace(db, workspace_id, user.id, min_role="editor"):
            return create_response(403, error_message="Editor access or higher required")

        # Verify environment exists in this workspace
        environment_result = await db.execute(
            select(Environment).where(
                Environment.id == environment_id,
                Environment.workspace_id == workspace_id
            )
        )
        environment = environment_result.scalar_one_or_none()
        if not environment:
            return create_response(404, error_message="Environment not found")

        # Convert VariablesSetRequest to simple dict format for JSON storage
        variables_dict = variables_data.variables  # Direct assignment since it's already Dict[str, str]

        # Determine if this is create or update
        is_create = environment.variables is None or len(environment.variables) == 0

        # Save variables (create or update)
        environment.variables = variables_dict

        await db.commit()
        await db.refresh(environment)

        # Prepare response data (same format as list_variables.py)
        data = {
            "environment_id": environment.id,
            "environment_name": environment.name,
            "variables": variables_dict,
            "created_at": environment.created_at,
            "updated_at": environment.updated_at
        }

        # Return appropriate status code
        status_code = 201 if is_create else 200
        return create_response(status_code, value_correction(data), VariablesResponse)

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
