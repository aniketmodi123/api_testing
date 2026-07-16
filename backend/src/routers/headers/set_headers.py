"""
What this file does: Exposes POST /{folder_id}/headers for creating a folder-level header record.
"""

from fastapi import APIRouter, Depends, Header as FastAPIHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import resolve_node_access, has_min_role, write_audit
from models import Header
from schema import HeaderCreateRequest, HeaderResponse
from utils import ExceptionHandler, create_response, value_correction

router = APIRouter()


@router.post("/{folder_id}/headers")
async def set_folder_headers(
    folder_id: int,
    header_data: HeaderCreateRequest,
    username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /{folder_id}/headers — create a header record for the folder; reject if one already exists."""
    try:
        access = await resolve_node_access(db, username, folder_id)
        if not access.user:
            return create_response(400, error_message="User not found")
        if not access.node:
            return create_response(404, error_message="Folder not found")
        if not has_min_role(access, "editor"):
            return create_response(403, error_message="Access denied")

        exists = (await db.execute(
            select(Header.id).where(Header.folder_id == folder_id).limit(1)
        )).scalar_one_or_none()
        if exists:
            return create_response(409, error_message="Header already exists")

        new_header = Header(folder_id=folder_id, content=header_data.content)
        db.add(new_header)
        await db.flush()
        await write_audit(
            db,
            username=access.user.username,
            action="header.create",
            entity_type="header",
            entity_id=new_header.id,
            workspace_id=access.node.workspace_id,
        )
        await db.commit()

        data = {
            "id": new_header.id,
            "folder_id": new_header.folder_id,
            "content": new_header.content,
            "created_at": new_header.created_at,
        }
        return create_response(201, value_correction(data), HeaderResponse)

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
