"""
What this file does: Exposes the GET /themes/active route for fetching the authenticated user's currently active custom theme.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from models import UserTheme, User
from schema import UserThemeResponse
from utils import create_response

router = APIRouter()


@router.get("/active")
async def get_active_theme(
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """GET /themes/active — return the user's active custom theme, or null when none is active."""
    user_id = (await db.execute(select(User.id).where(User.email == username))).scalar_one_or_none()
    if user_id is None:
        return create_response(400, error_message="User not found")

    result = await db.execute(
        select(UserTheme).where(
            UserTheme.user_id == user_id,
            UserTheme.is_active == True,
        )
    )
    theme = result.scalar_one_or_none()

    if not theme:
        return create_response(200, {"theme": None})

    return create_response(200, {"theme": UserThemeResponse.model_validate(theme).model_dump(mode="json")})
