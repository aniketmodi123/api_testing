from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import (
    get_db,
    serialize_data
)
from models import User
from schema import UserResponse
from utils import (
    ExceptionHandler,
    create_response,
    value_correction
)

router = APIRouter()


# Bonus: Get current user profile
@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    username: str= Header(...),
    db: AsyncSession = Depends(get_db)
):
    try:
        result = await db.execute(select(User).where(User.email == username))
        user = result.scalar_one_or_none()

        if user is None:
            return create_response(400, error_message="User not found")
        data= {
            "id": user.id  ,
            "username": user.username ,
            "email": user.email ,
            "god": user.god ,
            "created_at": user.created_at
        }
        return create_response(200, value_correction(data))
    except Exception as e:
        ExceptionHandler(e)