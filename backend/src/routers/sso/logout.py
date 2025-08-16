from fastapi import APIRouter, Header
from utils import ExceptionHandler, blacklist_token, create_response
from fastapi import APIRouter


router = APIRouter()

@router.delete("/logout")
async def logout_user(
    username:str = Header(...),
    authorization:str = Header(...)
):
    try:
        if authorization in ['', None]:
            return create_response(400, error_message="Authorization token not found.")
        success = await blacklist_token(username, token=authorization)
        if not success:
            return create_response(206, error_message="Logout Unsuccessful")
        return create_response(200, {"message":"Logout successful. Token is deactiveted."})
    except Exception as e:
        ExceptionHandler(e)