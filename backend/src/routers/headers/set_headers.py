from fastapi import APIRouter, Depends, Header as FastAPIHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import (
    get_db,
    get_user_by_username,
    verify_folder_ownership
)
from models import Header
from schema import (
    HeaderCreateRequest
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
    """Set/create folder-level headers"""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify folder ownership and type
        folder = await verify_folder_ownership(db, folder_id, user.id)
        if not folder:
            return create_response(206, error_message="Folder not found or access denied")

        result = await db.execute(
            select(Header)
            .where(
                Header.folder_id == folder_id
            )
        )
        if result.scalar_one_or_none():
            return create_response(400, error_message="Header already exists")

        # Create new header
        new_header = Header(
            folder_id=folder_id,
            content=header_data.content
        )

        db.add(new_header)
        await db.commit()
        await db.refresh(new_header)

        data = {
            "id": new_header.id,
            "folder_id": new_header.folder_id,
            "content": new_header.content,
            "created_at": new_header.created_at
        }

        return create_response(201, value_correction(data))

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)
