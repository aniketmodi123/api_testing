"""
What this file does: Exposes the PUT /themes/{theme_id} route for updating the name and/or token map of a custom theme owned by the authenticated user.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import get_user_by_username
from models import UserTheme
from schema import UserThemeUpdate, UserThemeResponse
from utils import (
    ExceptionHandler,
    create_response
)

router = APIRouter()


@router.put("/{theme_id}")
async def update_theme(
    theme_id: int,
    theme_data: UserThemeUpdate,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """PUT /themes/{theme_id} — update name and/or token_map for a custom theme owned by the caller."""
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

        # Patch provided fields
        if theme_data.name is not None:
            theme.name = theme_data.name
        if theme_data.token_map is not None:
            theme.token_map = theme_data.token_map

        await db.commit()
        await db.refresh(theme)

        data = UserThemeResponse.model_validate(theme).model_dump()
        return create_response(200, data, UserThemeResponse)

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
