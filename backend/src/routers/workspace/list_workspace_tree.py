from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from models import Workspace
from common_querys import get_user_by_username, get_workspace_tree_response
from utils import ExceptionHandler, create_response, value_correction

router = APIRouter()




@router.get("/{workspace_id}")
async def get_workspace_with_tree(
    workspace_id: int,
    include_apis: bool = Query(False, description="Include APIs and test cases in the tree"),
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Get workspace details with file tree structure, optionally including APIs and test cases for bulk testing"""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")


        # Set all user's workspaces inactive, then set this one active
        await db.execute(
            select(Workspace)
            .where(Workspace.user_id == user.id)
            .execution_options(synchronize_session="fetch")
        )
        await db.execute(
            Workspace.__table__.update()
            .where(Workspace.user_id == user.id)
            .values(active=False)
        )
        await db.execute(
            Workspace.__table__.update()
            .where(Workspace.id == workspace_id)
            .values(active=True)
        )
        await db.commit()

        # Use shared workspace tree response function
        data, err = await get_workspace_tree_response(db, workspace_id, include_apis=True)
        if not data:
            return create_response(206, error_message=err or "Workspace not found or access denied")
        return create_response(200, value_correction(data))

    except Exception as e:
        ExceptionHandler(e)