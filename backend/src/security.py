from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy import and_, select
from models import Cache
from config import JWT_ALGORITHM, JWT_SECRET_KEY, SessionLocal
from jose import jwt

from utils import create_response

def validate_required_headers(request, required_headers):

    for header in required_headers:
        if request.headers.get(header) is None:
            return f"The {header} header is required but missing."
    return None


async def authenticate_token(request):
    """
        verify token
        if token is incorrect
            return invalid token
        return status valid and user_name
    """
    required_headers = ["authorization","username"]
    validation_response = validate_required_headers(request, required_headers)
    if validation_response:
        raise HTTPException(status_code=401, detail=validation_response)

    token = request.headers.get("Authorization")
    if token is None:
        return False, False

    try:
        try:
            payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        except Exception as e:
            return False, False
        if payload is None:
            return False, False
        if payload['username'] != request.headers.get('username'):
            raise HTTPException(status_code=401, detail="Invalid username or token")

        async with SessionLocal() as db:
            stmt = select(Cache.black_list).where(
                and_(Cache.username == payload["username"], Cache.token == token)
            )
            res = await db.execute(stmt)

            black_list_status = res.scalars().first()

            if black_list_status is not None:
                if black_list_status is True:
                    return False, False
        return payload["username"]
    except Exception as e:
        return False, False



class AuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        # Routes that don't require authentication
        self.public_routes = {
            "/sign_up",
            "/sign_in",
            "/send-otp",
            "/forgot-password",
            "/swagger",
            "/redoc",
            "/openapi.json",
            "/",
            "/health"  # Add any health check endpoints
        }

    async def dispatch(self, request: Request, call_next):
        # Skip authentication for public routes
        if request.url.path in self.public_routes:
            response = await call_next(request)
            return response

        # Skip authentication for OPTIONS requests (CORS preflight)
        if request.method == "OPTIONS":
            response = await call_next(request)
            return response

        # Check authentication for protected routes
        try:
            username = await authenticate_token(request)

            if not username:
                return create_response(401, error_message= "Authentication required")

            # Add user info to request state for use in endpoints
            request.state.current_user = username

            response = await call_next(request)
            return response

        except HTTPException as e:
            return JSONResponse(
                status_code=e.status_code,
                content={"detail": e.detail}
            )
        except Exception as e:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Invalid authentication"}
            )