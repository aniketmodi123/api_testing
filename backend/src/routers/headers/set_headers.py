"""
What this file does: Exposes POST /{folder_id}/headers for creating a folder-level header record.
"""

from fastapi import APIRouter, Depends, Header as FastAPIHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import get_user_by_username, can_access_workspace, write_audit

from models import Node, Header
from schema import (
    HeaderCreateRequest,
    HeaderResponse
)
from utils import (
    ExceptionHandler,
    create_response,
    value_correction
)

router = APIRouter()


@router.post("/{folder_id}/headers")
async def set_folder_headers(
    folder_id: int,
    header_data: HeaderCreateRequest,
    username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db)
):
    """POST /{folder_id}/headers — create a header record for the folder; reject if one already exists."""
    try:
        # Get user
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

        result = await db.execute(
            select(Header)
            .where(
                Header.folder_id == folder_id
            )
        )
        if result.scalar_one_or_none():
            return create_response(409, error_message="Header already exists")

        # Create new header
        new_header = Header(
            folder_id=folder_id,
            content=header_data.content
        )

        db.add(new_header)
        await db.flush()
        await write_audit(db, username=user.username, action="header.create", entity_type="header", entity_id=new_header.id, workspace_id=folder.workspace_id)
        await db.commit()
        await db.refresh(new_header)

        data = {
            "id": new_header.id,
            "folder_id": new_header.folder_id,
            "content": new_header.content,
            "created_at": new_header.created_at
        }

        return create_response(201, value_correction(data), HeaderResponse)

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
