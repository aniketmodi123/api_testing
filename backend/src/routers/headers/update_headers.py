"""
What this file does: Exposes PUT /{folder_id}/headers for replacing the content of a folder's header record.
"""

from fastapi import APIRouter, Depends, Header as FastAPIHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import get_user_by_username, can_access_workspace, write_audit

from models import Node, Header
from schema import (
    HeaderUpdateRequest,
    HeaderResponse
)
from utils import (
    ExceptionHandler,
    create_response,
    value_correction
)

router = APIRouter()


@router.put("/{folder_id}/headers")
async def update_folder_headers(
    folder_id: int,
    header_data: HeaderUpdateRequest,
    username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db)
):
    """PUT /{folder_id}/headers — replace the content of the folder's header record."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Fetch folder, then require editor access (write)
        folder_result = await db.execute(select(Node).where(Node.id == folder_id))
        folder = folder_result.scalar_one_or_none()
        if not folder:
            return create_response(404, error_message="Folder not found")
        if not await can_access_workspace(db, folder.workspace_id, user.id, min_role="editor"):
            return create_response(403, error_message="Access denied")

        # Get the header for this folder
        result = await db.execute(
            select(Header).where(Header.folder_id == folder_id)
        )
        header = result.scalar_one_or_none()

        if not header:
            return create_response(404, error_message="No headers found for this folder")

        # Update header content
        header.content = header_data.content

        await write_audit(db, username=user.username, action="header.update", entity_type="header", entity_id=header.id, workspace_id=folder.workspace_id)
        await db.commit()
        await db.refresh(header)

        data = {
            "id": header.id,
            "folder_id": header.folder_id,
            "content": header.content,
            "created_at": header.created_at
        }

        return create_response(200, value_correction(data), HeaderResponse)

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)

