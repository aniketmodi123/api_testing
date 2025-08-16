from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from config import get_db
from models import User
from schema import UserResponse, UserUpdate
from utils import (
    ExceptionHandler,
    create_response,
    get_password_hash
)

router = APIRouter()

@router.put("/update_user", response_model=UserResponse)
async def update_user(
    user_update: UserUpdate,
    username:str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    try:
        update_data = user_update.model_dump(exclude_unset=True)

        if not update_data:
            return create_response(400, error_message="No fields provided for update")

        result = await db.execute(select(User).where(User.email == username))
        user = result.scalar_one_or_none()

        if user is None:
            return create_response(400, error_message="User not found")

        # Check if username is being updated and if it's already taken
        if "username" in update_data:
            stmt = select(User).where(
                User.username == update_data["username"],
                User.id != user.id
            )
            result = await db.execute(stmt)
            if result.scalar_one_or_none():
                return create_response(400, error_message="Username already taken")

        # Check if email is being updated and if it's already taken
        if "email" in update_data:
            stmt = select(User).where(
                User.email == update_data["email"],
                User.id != user.id
            )
            result = await db.execute(stmt)
            if result.scalar_one_or_none():
                return create_response(400, error_message="Email already taken")

        # Hash password if it's being updated
        if "password" in update_data:
            update_data["password_hash"] = get_password_hash(update_data.pop("password"))

        # Update user fields
        for field, value in update_data.items():
            setattr(user, field, value)

        await db.commit()

        return create_response(201, {"message": "User profile updated successfully"})

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)
