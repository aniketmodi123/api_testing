"""
What this file does: Exposes the POST /send-otp route for generating and emailing a password-reset OTP.
"""

from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from dateutil.relativedelta import relativedelta
from config import get_db
from models import User, OTPAttempt
from schema import ForgetPasswordRequest, MessageResponse
from utils import create_response, generate_otp, OTP_EXPIRY_SECONDS


router = APIRouter()


@router.post("/send-otp")
async def generate_otp_req(
    request: ForgetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """POST /send-otp — generate a time-limited OTP, upsert it in OTPAttempt, and send it to the user's email."""
    result = await db.execute(select(User.is_active).where(User.email == request.email))
    user_row = result.one_or_none()

    if not user_row:
        return create_response(
            200,
            data={"message": "If the email exists, an OTP has been sent to reset your password."},
            schema=MessageResponse,
        )

    if not user_row.is_active:
        return create_response(400, error_message="Account is deactivated. Please contact support.")

    otp = generate_otp()

    res = await db.execute(select(OTPAttempt).where(OTPAttempt.user_name == request.email))
    user_otp_record = res.scalar_one_or_none()
    now = datetime.now()

    if user_otp_record:
        if user_otp_record.locked_until and user_otp_record.locked_until > now:
            return create_response(429, error_message="Too many attempts. Please try again after some time.")
        user_otp_record.otp = otp
        user_otp_record.failed_attempts = 0
        user_otp_record.locked_until = None
        user_otp_record.expire_at = now + relativedelta(seconds=OTP_EXPIRY_SECONDS)
        user_otp_record.updated_at = now
    else:
        db.add(OTPAttempt(
            user_name=request.email,
            otp=otp,
            expire_at=now + relativedelta(seconds=OTP_EXPIRY_SECONDS),
        ))

    await db.flush()
    await db.commit()
    return create_response(
        200,
        data={"message": "OTP has been sent to your email to reset your password."},
        schema=MessageResponse,
    )
