"""
What this file does: Exposes the GET /me route for retrieving the authenticated user's profile.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from models import User
from schema import UserResponse
from utils import create_response, value_correction

router = APIRouter()


@router.get("/me")
async def get_current_user_profile(
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /me — return the profile of the currently authenticated user."""
    result = await db.execute(
        select(User.id, User.username, User.email, User.god, User.created_at)
        .where(User.email == username)
    )
    row = result.one_or_none()
    if row is None:
        return create_response(404, error_message="User not found")
    data = {
        "id": row.id,
        "username": row.username,
        "email": row.email,
        "god": row.god,
        "created_at": row.created_at,
    }
    return create_response(200, value_correction(data), UserResponse)
