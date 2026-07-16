"""
What this file does: Exposes the POST /themes route for saving a new custom theme owned by the authenticated user.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from models import UserTheme, User
from schema import UserThemeCreate, UserThemeResponse
from utils import create_response

router = APIRouter()


@router.post("")
async def create_theme(
    theme_data: UserThemeCreate,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """POST /themes — save a new custom theme for the authenticated user; rejects a duplicate name."""
    user_id = (await db.execute(select(User.id).where(User.email == username))).scalar_one_or_none()
    if user_id is None:
        return create_response(400, error_message="User not found")

    existing = (await db.execute(
        select(UserTheme.id).where(
            UserTheme.user_id == user_id,
            UserTheme.name == theme_data.name,
        )
    )).scalar_one_or_none()
    if existing is not None:
        return create_response(409, error_message="A theme with this name already exists")

    new_theme = UserTheme(
        user_id=user_id,
        name=theme_data.name,
        token_map=theme_data.token_map,
    )
    db.add(new_theme)
    await db.commit()

    return create_response(201, UserThemeResponse.model_validate(new_theme).model_dump(), UserThemeResponse)
