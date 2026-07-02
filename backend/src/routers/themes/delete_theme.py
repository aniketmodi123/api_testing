"""
What this file does: Exposes the DELETE /themes/{theme_id} route for permanently deleting a custom theme owned by the authenticated user.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import get_user_by_username
from models import UserTheme
from utils import (
    ExceptionHandler,
    create_response
)

router = APIRouter()


@router.delete("/{theme_id}")
async def delete_theme(
    theme_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """DELETE /themes/{theme_id} — permanently delete a custom theme owned by the caller."""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Get theme, guarding ownership
        result = await db.execute(
            select(UserTheme).where(
                and_(
                    UserTheme.id == theme_id,
                    UserTheme.user_id == user.id,
                )
            )
        )
        theme = result.scalar_one_or_none()

        if not theme:
            return create_response(404, error_message="Theme not found or access denied")

        await db.delete(theme)
        await db.commit()

        return create_response(204)

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
