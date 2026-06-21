"""
What this file does: Exposes the GET /themes/active route for fetching the authenticated user's currently active custom theme.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, and_
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


@router.get("/active")
async def get_active_theme(
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """GET /themes/active — return the user's active custom theme, or null when none is active."""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Get the active theme row, if any
        result = await db.execute(
            select(UserTheme).where(
                and_(
                    UserTheme.user_id == user.id,
                    UserTheme.is_active == True,
                )
            )
        )
        theme = result.scalar_one_or_none()

        if not theme:
            return create_response(200, {"theme": None})

        data = {"theme": UserThemeResponse.model_validate(theme).model_dump(mode="json")}
        return create_response(200, data)

    except Exception as e:
        ExceptionHandler(e)
