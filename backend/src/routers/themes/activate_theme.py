"""
What this file does: Exposes the PUT /themes/{theme_id}/activate route for switching the authenticated user's active custom theme.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, update, and_
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import get_user_by_username
from models import UserTheme
from schema import UserThemeResponse
from utils import (
    ExceptionHandler,
    create_response
)

router = APIRouter()


@router.put("/{theme_id}/activate")
async def activate_theme(
    theme_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """PUT /themes/{theme_id}/activate — make this theme the caller's sole active custom theme."""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Get the target theme, guarding ownership, before touching any other rows
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
            await db.rollback()
            return create_response(404, error_message="Theme not found or access denied")

        # Deactivate all of the user's other themes, then activate this one
        await db.execute(
            update(UserTheme)
            .where(UserTheme.user_id == user.id)
            .values(is_active=False)
        )
        theme.is_active = True

        await db.commit()
        await db.refresh(theme)

        data = UserThemeResponse.model_validate(theme).model_dump()
        return create_response(200, data, UserThemeResponse)

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
