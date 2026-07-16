"""
What this file does: Exposes PUT /{folder_id}/headers for replacing the content of a folder's header record.
"""

from fastapi import APIRouter, Depends, Header as FastAPIHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import resolve_node_access, has_min_role, write_audit
from models import Header
from schema import HeaderUpdateRequest, HeaderResponse
from utils import ExceptionHandler, create_response, value_correction

router = APIRouter()


@router.put("/{folder_id}/headers")
async def update_folder_headers(
    folder_id: int,
    header_data: HeaderUpdateRequest,
    username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db),
):
    """PUT /{folder_id}/headers — replace the content of the folder's header record."""
    try:
        access = await resolve_node_access(db, username, folder_id)
        if not access.user:
            return create_response(400, error_message="User not found")
        if not access.node:
            return create_response(404, error_message="Folder not found")
        if not has_min_role(access, "editor"):
            return create_response(403, error_message="Access denied")

        result = await db.execute(
            select(Header).where(Header.folder_id == folder_id)
        )
        header = result.scalar_one_or_none()
        if not header:
            return create_response(404, error_message="No headers found for this folder")

        header.content = header_data.content
        await write_audit(
            db,
            username=access.user.username,
            action="header.update",
            entity_type="header",
            entity_id=header.id,
            workspace_id=access.node.workspace_id,
        )
        await db.commit()

        data = {
            "id": header.id,
            "folder_id": header.folder_id,
            "content": header.content,
            "created_at": header.created_at,
        }
        return create_response(200, value_correction(data), HeaderResponse)

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
