"""
What this file does: Exposes the POST /themes route for saving a new custom theme owned by the authenticated user.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import get_user_by_username
from models import UserTheme
from schema import UserThemeCreate, UserThemeResponse
from utils import (
    ExceptionHandler,
    create_response
)

router = APIRouter()


@router.post("")
async def create_theme(
    theme_data: UserThemeCreate,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """POST /themes — save a new custom theme for the authenticated user; rejects a duplicate name."""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Reject duplicate theme name for this user
        existing_result = await db.execute(
            select(UserTheme).where(
                and_(
                    UserTheme.user_id == user.id,
                    UserTheme.name == theme_data.name,
                )
            )
        )
        if existing_result.scalar_one_or_none():
            return create_response(409, error_message="A theme with this name already exists")

        # Create theme
        new_theme = UserTheme(
            user_id=user.id,
            name=theme_data.name,
            token_map=theme_data.token_map,
        )

        db.add(new_theme)
        await db.commit()
        await db.refresh(new_theme)

        data = UserThemeResponse.model_validate(new_theme).model_dump()
        return create_response(201, data, UserThemeResponse)

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
