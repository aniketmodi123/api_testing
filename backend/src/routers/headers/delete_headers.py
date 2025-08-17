from fastapi import APIRouter, Depends, Header as FastAPIHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import (
    get_db,
    get_user_by_username,
    verify_folder_ownership
)
from models import Header
from utils import (
    ExceptionHandler,
    create_response
)

router = APIRouter()

@router.delete("/{folder_id}/headers")
async def delete_folder_headers(
    folder_id: int,
    username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db)
):
    """Delete the folder's header (no header_id needed since only one header per folder)"""
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

        # Delete header
        await db.delete(header)
        await db.commit()

        return create_response(200, {"message": "Headers deleted successfully"})
    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)