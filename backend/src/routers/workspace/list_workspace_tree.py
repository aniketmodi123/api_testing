"""
What this file does: Exposes GET /workspace/{workspace_id} for loading a workspace with its full node tree, marking it as the active workspace.
"""

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from models import Workspace
from common_querys import get_user_by_username, get_workspace_tree_response, can_access_workspace
from utils import ExceptionHandler, create_response, value_correction

router = APIRouter()


@router.get("/{workspace_id}")
async def get_workspace_with_tree(
    workspace_id: int,
    include_apis: bool = Query(False, description="Include APIs and test cases in the tree"),
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """GET /workspace/{workspace_id} — mark workspace as active, return its full node tree with optional API and test-case data."""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify access before reading or mutating anything
        ws_result = await db.execute(select(Workspace.user_id).where(Workspace.id == workspace_id))
        owner_id = ws_result.scalar_one_or_none()
        if owner_id is None:
            return create_response(404, error_message="Workspace not found")

        is_owner = owner_id == user.id
        if not is_owner and not await can_access_workspace(db, workspace_id, user.id, min_role="viewer"):
            return create_response(403, error_message="Access denied")

        # "active" is the owner's own tab-state — only toggle it when viewing your own workspace
        if is_owner:
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
            return create_response(404, error_message=err or "Workspace not found")
        return create_response(200, value_correction(data))

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)