"""
What this file does: Exposes GET /audit for admin-only paginated retrieval of workspace audit logs.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from config import get_db
from common_querys import get_user_by_username, can_access_workspace
from models import AuditLog
from schema import AuditLogResponse
from utils import ExceptionHandler, create_response

router = APIRouter()


@router.get("/audit")
async def list_audit_logs(
    workspace_id: int,
    limit: int = 50,
    offset: int = 0,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /audit — return paginated audit log rows for a workspace; restricted to admin and owner roles."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        ok = await can_access_workspace(db, workspace_id, user.id, min_role="admin")
        if not ok:
            return create_response(403, error_message="Access denied")

        limit = min(limit, 200)

        stmt = (
            select(AuditLog)
            .where(AuditLog.workspace_id == workspace_id)
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await db.execute(stmt)
        rows = result.scalars().all()

        data = [
            {
                "id": r.id,
                "username": r.username,
                "workspace_id": r.workspace_id,
                "action": r.action,
                "entity_type": r.entity_type,
                "entity_id": r.entity_id,
                "metadata": r.extra,
                "ip": r.ip,
                "created_at": str(r.created_at),
            }
            for r in rows
        ]
        return create_response(200, data, AuditLogResponse)
    except Exception as e:
        return ExceptionHandler(e)
