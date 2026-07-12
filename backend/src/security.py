"""
What this file does: Provides JWT token authentication middleware and header validation
for the FastAPI application; token blacklist state is checked against the sso_cache table.
"""

from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy import and_, select
from models import Cache
from config import JWT_ALGORITHM, JWT_SECRET_KEY, SessionLocal
from jose import jwt

from utils import create_response, logs


def validate_required_headers(request, required_headers):
    """Check that all required header names are present on the request.

    Returns:
        str: Error message naming the first missing header.
        None: Returned when all required headers are present.
    """
    for header in required_headers:
        if request.headers.get(header) is None:
            return f"The {header} header is required but missing."
    return None


async def authenticate_token(request):
    """Verify the JWT token in the Authorization header and confirm it is not blacklisted.

    Returns:
        str: The authenticated username from the token payload when valid and active.
        bool: ``False`` when the token is missing, invalid, expired, username mismatches,
              or the token has been blacklisted.

    Steps:
        - Step 1: Extract Authorization and username from headers or cookies; return False when either is missing
        - Step 2: Strip "Bearer " prefix when present
        - Step 3: Decode the JWT; return False on any decode error
        - Step 4: Verify the username in the payload matches the request username header
        - Step 5: Query the Cache table for the token; return False when blacklisted or not found
        - Step 6: Return the authenticated username
    """
    # Step 1: Extract token and username
    token = request.headers.get("Authorization") or request.headers.get("authorization")
    username = request.headers.get("username") or request.cookies.get("username")

    if not token or not username:
        return False

    # Step 2: Strip Bearer prefix
    if token.startswith("Bearer "):
        token = token.replace("Bearer ", "")

    try:
        # Step 3: Decode JWT
        try:
            payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        except Exception as e:
            logs("JWT decode error", type="error")
            return False

        if payload is None:
            return False

        # Step 4: Verify username match
        request_username = username

        if payload['username'] != request_username:
            logs("JWT username mismatch", type="error")
            return False

        # Step 5: Check blacklist in cache
        async with SessionLocal() as db:
            stmt = select(Cache.black_list).where(
                and_(Cache.username == payload["username"], Cache.token == token)
            )
            res = await db.execute(stmt)

            black_list_status = res.scalars().first()

            if black_list_status is not None:
                if black_list_status is True:
                    return False
                return payload["username"]  # Step 6: Return authenticated username
    except Exception as e:
        return False


class AuthMiddleware(BaseHTTPMiddleware):
    """Intercept every request and enforce JWT authentication on protected routes.

    Attributes:
        public_routes: Set of URL paths that skip authentication entirely.
        special_routes: Set of URL paths that require authentication but have custom handling.
    """

    def __init__(self, app):
        super().__init__(app)
        # Routes that don't require authentication
        self.public_routes = {
            "/sign_up",
            "/sign_in",
            "/pat/token",
            "/send-otp",
            "/forgot-password",
            "/verify-otp",
            "/reset-password",
            "/swagger",
            "/redoc",
            "/openapi.json",
            "/",
            "/health",
            "/docs"
        }

        # These routes require authentication but need special handling
        self.special_routes = {
            "/me"
        }

    async def dispatch(self, request: Request, call_next):
        """Authenticate the request and forward it, or return a 401 response."""
        # Skip authentication for public routes
        if request.url.path in self.public_routes:
            response = await call_next(request)
            return response

        # /m/ = public mock serve; /docs/ = public published docs; /meta/ = public info — no auth needed
        if request.url.path.startswith("/m/") or request.url.path.startswith("/docs/") or request.url.path.startswith("/meta/"):
            response = await call_next(request)
            return response

        # /mcp-server/* = embedded MCP server; it runs its own PAT bearer auth, so this
        # middleware must not gate it (its token page is public by design).
        if request.url.path.startswith("/mcp-server"):
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
                return create_response(401, error_message="Authentication required again since your session has expired.")

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
                content={"detail": "Authentication required again since your session has expired"}
            )
