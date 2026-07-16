"""
What this file does: Exposes the GET /workspace/list route for listing all workspaces owned by or shared with the authenticated user.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import get_user_by_username
from models import Workspace, WorkspaceMember
from utils import ExceptionHandler, create_response, value_correction

router = APIRouter()


@router.get("/list")
async def list_workspaces(
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /workspace/list — return all workspaces the user owns plus all workspaces they have joined as a member."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        owned_result = await db.execute(
            select(
                Workspace.id,
                Workspace.name,
                Workspace.description,
                Workspace.created_at,
                Workspace.active,
            )
            .where(Workspace.user_id == user.id)
            .order_by(Workspace.active.desc(), Workspace.created_at.desc())
        )
        workspace_list = []
        owned_ids: set[int] = set()
        for row in owned_result.all():
            owned_ids.add(row.id)
            workspace_list.append({
                "id": row.id,
                "name": row.name,
                "description": row.description,
                "created_at": row.created_at,
                "active": row.active,
                "is_shared": False,
                "member_role": None,
            })

        shared_result = await db.execute(
            select(
                Workspace.id,
                Workspace.name,
                Workspace.description,
                Workspace.created_at,
                Workspace.active,
                WorkspaceMember.role,
            )
            .join(WorkspaceMember, Workspace.id == WorkspaceMember.workspace_id)
            .where(
                and_(
                    WorkspaceMember.user_id == user.id,
                    WorkspaceMember.joined_at.isnot(None),
                )
            )
            .order_by(Workspace.created_at.desc())
        )
        for row in shared_result.all():
            if row.id not in owned_ids:
                workspace_list.append({
                    "id": row.id,
                    "name": row.name,
                    "description": row.description,
                    "created_at": row.created_at,
                    "active": row.active,
                    "is_shared": True,
                    "member_role": row.role,
                })

        return create_response(200, value_correction(workspace_list))

    except Exception as e:
        return ExceptionHandler(e)
