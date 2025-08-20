from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import (
    get_db
)
from models import User
from utils import (
    ExceptionHandler,
    create_response,
    blacklist_token
)

router = APIRouter()


@router.delete("/delete_user")
async def delete_user(
    username: str= Header(...),
    db: AsyncSession = Depends(get_db)
):
    try:
        result = await db.execute(select(User).where(User.email == username))
        user = result.scalar_one_or_none()

        if user is None:
            return create_response(400, error_message="User not found")

        await blacklist_token(username)
        user.is_active = False
        await db.commit()

        return create_response(200 , error_message= "User account successfully deleted")
    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)