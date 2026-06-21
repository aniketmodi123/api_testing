"""
What this file does: Exposes the GET /themes route for listing all custom themes saved by the authenticated user.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import get_user_by_username
from models import UserTheme
from schema import UserThemeListResponse, UserThemeResponse
from utils import (
    ExceptionHandler,
    create_response
)

router = APIRouter()


@router.get("")
async def list_themes(
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """GET /themes — return all custom themes saved by the authenticated user, newest first."""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # List themes owned by the user
        result = await db.execute(
            select(UserTheme)
            .where(UserTheme.user_id == user.id)
            .order_by(UserTheme.created_at.desc())
        )
        rows = result.scalars().all()

        data = {
            "themes": [UserThemeResponse.model_validate(t).model_dump() for t in rows],
            "total": len(rows),
        }
        return create_response(200, data, UserThemeListResponse)

    except Exception as e:
        ExceptionHandler(e)
