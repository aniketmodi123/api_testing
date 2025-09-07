from fastapi import APIRouter, Depends, Header as FastAPIHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import (
    get_db,
    get_user_by_username
)
from models import Environment, Workspace
from utils import (
    ExceptionHandler,
    create_response
)

router = APIRouter()


@router.delete("/workspace/{workspace_id}/environments/{environment_id}/variables")
async def delete_environment_variables(
    workspace_id: int,
    environment_id: int,
    username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db)
):
    """Delete environment variables (similar to headers)"""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify workspace ownership
        workspace_result = await db.execute(
            select(Workspace).where(
                Workspace.id == workspace_id,
                Workspace.user_id == user.id
            )
        )
        workspace = workspace_result.scalar_one_or_none()
        if not workspace:
            return create_response(206, error_message="Workspace not found or access denied")

        # Get environment
        environment_result = await db.execute(
            select(Environment).where(
                Environment.id == environment_id,
                Environment.workspace_id == workspace_id
            )
        )
        environment = environment_result.scalar_one_or_none()
        if not environment:
            return create_response(206, error_message="Environment not found")

        if not environment.variables:
            return create_response(206, error_message="No variables found for this environment")

        # Delete variables by setting to None/empty
        environment.variables = None

        await db.commit()

        return create_response(200, {"message": "Variables deleted successfully"})

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)
