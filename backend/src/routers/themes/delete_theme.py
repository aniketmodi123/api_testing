"""
What this file does: Exposes the DELETE /themes/{theme_id} route for permanently deleting a custom theme owned by the authenticated user.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from models import UserTheme, User
from utils import create_response

router = APIRouter()


@router.delete("/{theme_id}")
async def delete_theme(
    theme_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """DELETE /themes/{theme_id} — permanently delete a custom theme owned by the caller."""
    user_id = (await db.execute(select(User.id).where(User.email == username))).scalar_one_or_none()
    if user_id is None:
        return create_response(400, error_message="User not found")

    result = await db.execute(
        delete(UserTheme).where(
            UserTheme.id == theme_id,
            UserTheme.user_id == user_id,
        )
    )
    if result.rowcount == 0:
        return create_response(404, error_message="Theme not found or access denied")

    await db.commit()
    return create_response(204)
