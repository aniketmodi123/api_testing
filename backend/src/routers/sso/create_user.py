from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import (
    get_db
)
from models import User
from schema import UserSignUp
from utils import (
    ExceptionHandler,
    get_password_hash,
    create_response
)

router = APIRouter()


@router.post("/sign_up")
async def sign_up(user_data: UserSignUp, db: AsyncSession = Depends(get_db)):
    """
    Register a new user account.
    """
    try:
        # Check if email already exists
        stmt = select(User).where(User.email == user_data.email)
        result = await db.execute(stmt)
        if result.scalar_one_or_none():
            return create_response(400, error_message ="Email already registered")

        # Create new user
        hashed_password = get_password_hash(user_data.password)
        new_user = User(
            username=user_data.email,
            email=user_data.email,
            password=hashed_password
        )

        db.add(new_user)
        await db.commit()

        return create_response(201, {"message": "User registered successfully"})

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)
