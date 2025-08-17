from fastapi import APIRouter, Depends, Header as FastAPIHeader
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from config import (
    get_db,
    get_user_by_username,
    verify_folder_ownership
)
from models import Header
from schema import (
    HeaderUpdateRequest
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
    """Update the folder's header (no header_id needed since only one header per folder)"""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        folder = await verify_folder_ownership(db, folder_id, user.id)
        if not folder:
            return create_response(206, error_message="Folder not found or access denied")

        # Get the header for this folder
        result = await db.execute(
            select(Header).where(Header.folder_id == folder_id)
        )
        header = result.scalar_one_or_none()

        if not header:
            return create_response(206, error_message="No headers found for this folder")

        # Update header content
        header.content = header_data.content

        await db.commit()
        await db.refresh(header)

        data = {
            "id": header.id,
            "folder_id": header.folder_id,
            "content": header.content,
            "created_at": header.created_at,
            "folder_name": folder.name
        }

        return create_response(200, value_correction(data))

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)

