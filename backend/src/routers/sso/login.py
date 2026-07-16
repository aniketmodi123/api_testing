"""
What this file does: Exposes the POST /sign_in route for authenticating users and issuing JWT access tokens.
"""

from datetime import datetime
from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import log_failed_attempt, log_success_attempt
from models import User, Cache
from schema import UserSignIn
from utils import create_response, verify_password, create_access_token

router = APIRouter()


class AccessTokenResponse(BaseModel):
    """Carry the JWT access token issued after a successful sign-in.

    Attributes:
        access_token: Signed JWT string for use in the Authorization header.
    """

    access_token: str


@router.post("/sign_in")
async def sign_in(user_credentials: UserSignIn, db: AsyncSession = Depends(get_db)):
    """POST /sign_in — verify credentials, issue a 7-day JWT, cache the token, and log the attempt."""
    result = await db.execute(
        select(User.email, User.password, User.username)
        .where(User.email == user_credentials.email)
    )
    user = result.one_or_none()

    if not user or not verify_password(user_credentials.password, user.password):
        await log_failed_attempt(db, user_credentials.email)
        await db.commit()
        return create_response(401, error_message="Incorrect username or password")

    access_token = await create_access_token(
        data={"username": user.email},
        expires_delta=relativedelta(days=7),
    )
    db.add(Cache(username=user.email, token=access_token, timestamp=datetime.now()))
    await log_success_attempt(db, user.username)
    await db.commit()
    return create_response(200, {"access_token": access_token}, AccessTokenResponse)
