"""
What this file does: Exposes the POST /sign_up route for registering new user accounts.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from models import User
from schema import UserSignUp, MessageResponse
from utils import get_password_hash, create_response

router = APIRouter()


@router.post("/sign_up")
async def sign_up(user_data: UserSignUp, db: AsyncSession = Depends(get_db)):
    """POST /sign_up — create a new user account; reject if email is already registered."""
    result = await db.execute(select(User.id).where(User.email == user_data.email))
    if result.scalar_one_or_none() is not None:
        return create_response(409, error_message="Email already registered")

    new_user = User(
        username=user_data.email,
        email=user_data.email,
        password=get_password_hash(user_data.password),
    )
    db.add(new_user)
    await db.commit()
    return create_response(201, {"message": "User registered successfully"}, MessageResponse)
