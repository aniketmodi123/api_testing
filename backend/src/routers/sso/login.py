from datetime import datetime
from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import (
    get_db,
    log_failed_attempt,
    log_success_attempt
)
from models import User, Cache
from schema import UserSignIn
from utils import (
    ExceptionHandler,
    create_response,
    verify_password,
    create_access_token
)

router = APIRouter()


@router.post("/sign_in")
async def sign_in(user_credentials: UserSignIn, db: AsyncSession = Depends(get_db)):
    """
    Authenticate user and return access token.
    """
    try:
        # Get user by username
        stmt = select(User).where(User.email == user_credentials.email)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()

        # Verify user exists and password is correct
        if not user or not verify_password(user_credentials.password, user.password):
            await log_failed_attempt(db, user_credentials.email)
            return create_response(401, error_message = "Incorrect username or password")

        # Create access token
        token_data = {"username": user.email}
        access_token = await create_access_token(
            data=token_data,
            expires_delta=relativedelta(days= 7)
        )

        # Cache the token
        cache_entry = Cache(
            username=user.email,
            token=access_token,
            timestamp=datetime.now()
        )
        db.add(cache_entry)

        # Log successful login
        await log_success_attempt(db, user.username)
        return create_response(200, {"access_token": access_token})

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)
    finally:
        await db.commit()