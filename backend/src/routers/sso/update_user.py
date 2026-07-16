"""
What this file does: Exposes the PUT /update_user route for updating the authenticated user's profile fields.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from models import User
from schema import MessageResponse, UserUpdate
from utils import create_response

router = APIRouter()


@router.put("/update_user")
async def update_user(
    user_update: UserUpdate,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """PUT /update_user — patch the authenticated user's profile; reject duplicate email."""
    update_data = user_update.model_dump(exclude_unset=True)
    if not update_data:
        return create_response(400, error_message="No fields provided for update")

    result = await db.execute(select(User).where(User.email == username))
    user = result.scalar_one_or_none()
    if user is None:
        return create_response(404, error_message="User not found")

    if "email" in update_data:
        dup = await db.execute(
            select(User.id).where(User.email == update_data["email"], User.id != user.id)
        )
        if dup.scalar_one_or_none() is not None:
            return create_response(409, error_message="Email already taken")

    for field, value in update_data.items():
        setattr(user, field, value)
    await db.commit()
    return create_response(200, {"message": "User profile updated successfully"}, MessageResponse)
