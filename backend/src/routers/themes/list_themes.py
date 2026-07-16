"""
What this file does: Exposes the GET /themes route for listing all custom themes saved by the authenticated user.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from models import UserTheme, User
from schema import UserThemeListResponse, UserThemeResponse
from utils import create_response

router = APIRouter()


@router.get("")
async def list_themes(
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """GET /themes — return all custom themes saved by the authenticated user, newest first."""
    user_id = (await db.execute(select(User.id).where(User.email == username))).scalar_one_or_none()
    if user_id is None:
        return create_response(400, error_message="User not found")

    result = await db.execute(
        select(UserTheme)
        .where(UserTheme.user_id == user_id)
        .order_by(UserTheme.created_at.desc())
    )
    rows = result.scalars().all()

    data = {
        "themes": [UserThemeResponse.model_validate(t).model_dump() for t in rows],
        "total": len(rows),
    }
    return create_response(200, data, UserThemeListResponse)
