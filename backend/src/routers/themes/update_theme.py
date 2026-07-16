"""
What this file does: Exposes the PUT /themes/{theme_id} route for updating the name and/or token map of a custom theme owned by the authenticated user.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from models import UserTheme, User
from schema import UserThemeUpdate, UserThemeResponse
from utils import create_response

router = APIRouter()


@router.put("/{theme_id}")
async def update_theme(
    theme_id: int,
    theme_data: UserThemeUpdate,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """PUT /themes/{theme_id} — update name and/or token_map for a custom theme owned by the caller."""
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

    if theme_data.name is not None:
        theme.name = theme_data.name
    if theme_data.token_map is not None:
        theme.token_map = theme_data.token_map

    await db.commit()

    return create_response(200, UserThemeResponse.model_validate(theme).model_dump(), UserThemeResponse)
