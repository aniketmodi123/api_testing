"""
What this file does: Exposes the DELETE /delete_user route for soft-deleting the authenticated user's account.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from models import User
from utils import blacklist_token, create_response

router = APIRouter()


@router.delete("/delete_user")
async def delete_user(
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """DELETE /delete_user — blacklist the user's token and mark the account inactive."""
    result = await db.execute(
        update(User).where(User.email == username).values(is_active=False)
    )
    if result.rowcount == 0:
        return create_response(404, error_message="User not found")
    await blacklist_token(username)
    await db.commit()
    return create_response(200, message="User account successfully deleted")
