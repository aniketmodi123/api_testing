"""
What this file does: Exposes GET /{folder_id}/headers for retrieving the most recent header record for a folder.
"""

from fastapi import APIRouter, Depends, Header as FastAPIHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import get_user_by_username, can_access_workspace

from models import Node, Header
from schema import HeaderWithFolderResponse
from utils import (
    ExceptionHandler,
    create_response,
    value_correction
)

router = APIRouter()


@router.get("/{folder_id}/headers")
async def get_folder_headers(
    folder_id: int,
    username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db)
):
    """GET /{folder_id}/headers — return the most recently created header record for the folder."""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Fetch folder, then require at least viewer access
        folder_result = await db.execute(select(Node).where(Node.id == folder_id))
        folder = folder_result.scalar_one_or_none()
        if not folder:
            return create_response(404, error_message="Folder not found")
        if not await can_access_workspace(db, folder.workspace_id, user.id, min_role="viewer"):
            return create_response(403, error_message="Access denied")

        # Get the most recent header for this folder
        result = await db.execute(
            select(Header)
            .where(Header.folder_id == folder_id)
            .order_by(Header.created_at.desc())
            .limit(1)
        )
        header = result.scalar_one_or_none()

        if not header:
            return create_response(404, error_message="No headers found for this folder")

        data = {
            "id": header.id,
            "folder_id": header.folder_id,
            "content": header.content,
            "created_at": header.created_at,
            "folder_name": folder.name,
            "workspace_id": folder.workspace_id
        }

        return create_response(200, value_correction(data), HeaderWithFolderResponse)

    except Exception as e:
        return ExceptionHandler(e)

