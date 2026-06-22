"""
What this file does: Exposes the PUT /update_user route for updating the authenticated user's profile fields.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from config import get_db
from models import User
from schema import MessageResponse, UserUpdate
from utils import (
    ExceptionHandler,
    create_response,
    get_password_hash
)

router = APIRouter()

@router.put("/update_user")
async def update_user(
    user_update: UserUpdate,
    username:str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """PUT /update_user — patch the authenticated user's profile; reject duplicate email."""
    try:
        update_data = user_update.model_dump(exclude_unset=True)

        if not update_data:
            return create_response(400, error_message="No fields provided for update")

        result = await db.execute(select(User).where(User.email == username))
        user = result.scalar_one_or_none()

        if user is None:
            return create_response(404, error_message="User not found")

        # Check if email is being updated and if it's already taken
        if "email" in update_data:
            stmt = select(User).where(
                User.email == update_data["email"],
                User.id != user.id
            )
            result = await db.execute(stmt)
            if result.scalar_one_or_none():
                return create_response(409, error_message="Email already taken")

        # Update user fields
        for field, value in update_data.items():
            setattr(user, field, value)

        await db.commit()

        return create_response(200, {"message": "User profile updated successfully"}, MessageResponse)

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
