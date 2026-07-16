"""
What this file does: Exposes the DELETE /logout route for blacklisting the caller's JWT token.
"""

from fastapi import APIRouter, Header
from schema import MessageResponse
from utils import blacklist_token, create_response


router = APIRouter()


@router.delete("/logout")
async def logout_user(
    username: str = Header(...),
    authorization: str = Header(...),
):
    """DELETE /logout — blacklist the provided JWT token so it cannot be reused."""
    if not authorization:
        return create_response(400, error_message="Authorization token not found.")
    success = await blacklist_token(username, token=authorization)
    if not success:
        return create_response(206, error_message="Logout Unsuccessful")
    return create_response(200, {"message": "Logout successful. Token is deactiveted."}, MessageResponse)
