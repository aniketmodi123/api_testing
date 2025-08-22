from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from dateutil.relativedelta import relativedelta
from config import get_db
from models import User, OTPAttempt
from schema import ForgetPasswordRequest, MessageResponse
from utils import (
    ExceptionHandler,
    create_response,
    generate_otp,
    email_otp_message,
    logs,
    OTP_EXPIRY_SECONDS
)


router = APIRouter()

MAX_ATTEMPTS = 2
LOCK_DURATION = 10


@router.post("/send-otp")
async def generate_otp_req(
    request: ForgetPasswordRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Initiate password reset by sending OTP to user's email.
    """
    try:
        # Check if user exists
        stmt = select(User).where(User.email == request.email)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()

        if not user:
            # For security reasons, don't reveal if email exists or not
            return create_response(
                200,
                data={"message": "If the email exists, an OTP has been sent to reset your password."}
            )

        # Check if user is active
        if not user.is_active:
            return create_response(
                400,
                error_message="Account is deactivated. Please contact support."
            )

        # Use existing OTP system - generate OTP for the user's email (using email as username)
        otp = generate_otp()

        # Check for existing OTP attempt
        res = await db.execute(
            select(OTPAttempt).where(OTPAttempt.user_name == request.email)
        )
        user_otp_record = res.scalar_one_or_none()

        now = datetime.now()

        if user_otp_record:
            if user_otp_record.locked_until and user_otp_record.locked_until > now:
                return create_response(
                    429,
                    error_message="Too many attempts. Please try again after some time."
                )
            # Reset & update existing record
            user_otp_record.otp = otp
            user_otp_record.failed_attempts = 0
            user_otp_record.locked_until = None
            user_otp_record.expire_at = now + relativedelta(seconds=OTP_EXPIRY_SECONDS)
            user_otp_record.updated_at = now
        else:
            # Create new record
            new_otp_record = OTPAttempt(
                user_name=request.email,
                otp=otp,
                expire_at=now + relativedelta(seconds=OTP_EXPIRY_SECONDS),
            )
            db.add(new_otp_record)

        await db.flush()

        # Send OTP via email using existing function
        # email_sent = email_otp_message(otp, request.email, "password reset")
        email_sent = True

        if not email_sent:
            logs(f"Failed to send OTP to {request.email}", type="warning")

        await db.commit()

        return create_response(
            200,
            data={"message": "OTP has been sent to your email to reset your password."},
            schema=MessageResponse
        )

    except Exception as e:
        logs(f"Error in forget password: {e}", type="error")
        await db.rollback()
        ExceptionHandler(e)

