"""
What this file does: Exposes GET /{folder_id}/headers for retrieving the most recent header record for a folder.
"""

from fastapi import APIRouter, Depends, Header as FastAPIHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import resolve_node_access, has_min_role
from models import Header
from schema import HeaderWithFolderResponse
from utils import ExceptionHandler, create_response, value_correction

router = APIRouter()


@router.get("/{folder_id}/headers")
async def get_folder_headers(
    folder_id: int,
    username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /{folder_id}/headers — return the most recently created header record for the folder."""
    try:
        access = await resolve_node_access(db, username, folder_id)
        if not access.user:
            return create_response(400, error_message="User not found")
        if not access.node:
            return create_response(404, error_message="Folder not found")
        if not has_min_role(access, "viewer"):
            return create_response(403, error_message="Access denied")

        result = await db.execute(
            select(
                Header.id,
                Header.folder_id,
                Header.content,
                Header.created_at,
            )
            .where(Header.folder_id == folder_id)
            .order_by(Header.created_at.desc())
            .limit(1)
        )
        row = result.first()
        if not row:
            return create_response(404, error_message="No headers found for this folder")

        data = {
            "id": row.id,
            "folder_id": row.folder_id,
            "content": row.content,
            "created_at": row.created_at,
            "folder_name": access.node.name,
            "workspace_id": access.node.workspace_id,
        }
        return create_response(200, value_correction(data), HeaderWithFolderResponse)

    except Exception as e:
        return ExceptionHandler(e)
