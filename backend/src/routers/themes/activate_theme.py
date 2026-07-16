"""
What this file does: Exposes the PUT /themes/{theme_id}/activate route for switching the authenticated user's active custom theme.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from models import UserTheme, User
from schema import UserThemeResponse
from utils import create_response

router = APIRouter()


@router.put("/{theme_id}/activate")
async def activate_theme(
    theme_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """PUT /themes/{theme_id}/activate — make this theme the caller's sole active custom theme."""
    user_id = (await db.execute(select(User.id).where(User.email == username))).scalar_one_or_none()
    if user_id is None:
        return create_response(400, error_message="User not found")

    result = await db.execute(
        select(UserTheme).where(
            UserTheme.id == theme_id,
            UserTheme.user_id == user_id,
        )
    )
    theme = result.scalar_one_or_none()
    if not theme:
        return create_response(404, error_message="Theme not found or access denied")

    await db.execute(
        update(UserTheme)
        .where(UserTheme.user_id == user_id)
        .values(is_active=False)
    )
    theme.is_active = True
    await db.commit()

    return create_response(200, UserThemeResponse.model_validate(theme).model_dump(), UserThemeResponse)
