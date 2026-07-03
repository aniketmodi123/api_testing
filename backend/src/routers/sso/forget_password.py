"""
What this file does: Exposes POST /change-password and POST /forgot-password routes for updating user passwords with OTP verification.
"""

from datetime import datetime
from fastapi import APIRouter, HTTPException, Header, status, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from dateutil.relativedelta import relativedelta
from config import get_db
from common_querys import log_failed_attempt
from models import User, OTPAttempt
from schema import ChangePassword, ForgotPassword, MessageResponse
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
    """
    What it does: Validate the OTP for a user and consume it on success, enforcing attempt limits and expiry.
    Raises:
        HTTPException: When OTP record is missing or already consumed (400), OTP is expired (400),
                       account is locked out (403), max attempts reached (403), or OTP is wrong (400).
    Steps:
        - Step 1: Query OTPAttempt for username; raise 400 if record is missing or OTP already consumed
        - Step 2: Raise 400 if expire_at has passed
        - Step 3: Raise 403 if locked_until is in the future
        - Step 4: Raise 403 and clear OTP when failed_attempts has already reached MAX_ATTEMPTS
        - Step 5: Raise 400 and increment failed_attempts when OTP doesn't match; apply lock when attempts now equal MAX_ATTEMPTS
        - Step 6: Consume OTP on success — reset failed_attempts and set otp to None
    """
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
    """POST /change-password — verify old password, hash and save the new one, then blacklist the current token."""
    try:
        if request.new_password != request.new_password_again:
            return create_response(400, error_message="please enter same passwords")

        if request.new_password == request.old_password:
            return create_response(400, error_message="Please enter a new password.")

        res = await db.execute(select(User).where(User.email == username))
        _user = res.scalar_one_or_none()

        if not _user:
            return create_response(404, error_message="User not found")

        if not _user.is_active:
            # if your log_failed_attempt is sync, remove await
            await log_failed_attempt(db, username)
            return create_response(403, error_message="User account is not active")

        if not verify_password(request.old_password, _user.password):
            await log_failed_attempt(db, username)
            return create_response(400, error_message="old password is incorrect")

        _user.password = get_password_hash(request.new_password)

        # blacklist the current token for this user (keep as-is; if async, add await)
        await blacklist_token(username)

        await db.commit()
        return create_response(200, {"message": "Password updated successfully"}, MessageResponse)

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)


@router.post("/forgot-password")
async def forgot_password(
    request: ForgotPassword,
    db: AsyncSession = Depends(get_db)
):
    """POST /forgot-password — verify and consume OTP, then reset the user's password."""
    try:
        await verify_and_consume_otp(db, request.email, request.otp)
        if request.new_password != request.new_password_again:
            return create_response(400, error_message="Please enter the same passwords")

        user_name = request.email

        result = await db.execute(select(User).where(User.email == user_name))

        _user = result.scalars().first()

        if not _user:
            return create_response(404, error_message="User not found")

        if not _user.is_active:
            await log_failed_attempt(db, user_name)
            return create_response(403, error_message="User account is not active")

        _user.password = get_password_hash(request.new_password)

        await blacklist_token(user_name)

        await db.commit()
        return create_response(200, {"message": "Password updated successfully"}, MessageResponse)

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
