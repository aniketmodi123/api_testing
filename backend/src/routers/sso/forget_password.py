from datetime import datetime
from fastapi import APIRouter, HTTPException, Header, status, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from dateutil.relativedelta import relativedelta
from config import get_db, log_failed_attempt
from models import User, OTPAttempt
from schema import ChangePassword, ForgotPassword
from utils import (
    ExceptionHandler,
    blacklist_token,
    create_response,
    get_password_hash,
    verify_password
)


router = APIRouter()

MAX_ATTEMPTS = 2
LOCK_DURATION = 10


async def verify_and_consume_otp(db, username: str, otp: int) -> None:
    now = datetime.now()
    res = await db.execute(select(OTPAttempt).where(OTPAttempt.user_name == username))
    rec = res.scalars().first()

    if not rec or rec.otp is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OTP not found for this user")

    if rec.expire_at and rec.expire_at < now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OTP is expired, Please try again")

    if rec.locked_until is not None and rec.locked_until > now:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is locked. Please try again later")

    if (rec.failed_attempts or 0) >= MAX_ATTEMPTS:
        rec.failed_attempts = 0
        rec.otp = None
        await db.commit()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Please genrate new OTP as your maximum attempts reached.")

    if rec.otp != otp:
        rec.failed_attempts = (rec.failed_attempts or 0) + 1
        if rec.failed_attempts == MAX_ATTEMPTS:
            rec.locked_until = now + relativedelta(minutes=LOCK_DURATION)
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect OTP")

    # success: consume OTP
    rec.failed_attempts = 0
    rec.otp = None
    await db.flush()


@router.post("/change-password")
async def change_password(
    request: ChangePassword,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Change password for admin/consumer:
      - validate new passwords match
      - verify user exists and is active
      - check old password
      - hash & save new password
      - blacklist token
    """
    try:
        if request.new_password != request.new_password_again:
            return create_response(400, error_message="please enter same passwords")

        if request.new_password == request.old_password:
            return create_response(400, error_message="Please enter a new password.")

        res = await db.execute(select(User).where(User.email == username))
        _user = res.scalar_one_or_none()

        if not _user:
            return create_response(status.HTTP_401_UNAUTHORIZED, "User not found")

        if not _user.is_active:
            # if your log_failed_attempt is sync, remove await
            await log_failed_attempt(db, username)
            return create_response(status.HTTP_401_UNAUTHORIZED, error_message="User account is not active")

        if not verify_password(request.old_password, _user.password):
            await log_failed_attempt(db, username)
            return create_response(400, error_message="old password is incorrect")

        _user.password = get_password_hash(request.new_password)

        # blacklist the current token for this user (keep as-is; if async, add await)
        await blacklist_token(username)

        await db.commit()
        return create_response(200, {"message": "Password updated successfully"})

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)


@router.post("/forgot-password")
async def forgot_password(
    request: ForgotPassword,
    db: AsyncSession = Depends(get_db)
):
    try:
        await verify_and_consume_otp(db, request.email, request.otp)
        if request.new_password != request.new_password_again:
            return create_response(400, error_message="Please enter the same passwords")

        user_name = request.email

        result = await db.execute(select(User).where(User.email == user_name))

        _user = result.scalars().first()

        if not _user:
            return create_response(status.HTTP_401_UNAUTHORIZED, "User not found")

        if not _user.is_active:
            await log_failed_attempt(db, user_name)
            return create_response(status.HTTP_401_UNAUTHORIZED, "User account is not active")

        _user.password = get_password_hash(request.new_password)

        await blacklist_token(user_name)

        await db.commit()
        return create_response(200, {"message": "Password updated successfully"})

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
