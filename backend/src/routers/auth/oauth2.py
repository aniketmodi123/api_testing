"""
What this file does: Exposes POST /auth/oauth2/token (fetch+cache) and GET /auth/oauth2/token/{auth_ref} (status only, never raw token) for OAuth2 client-credentials and authorization-code grants; tokens are encrypted at rest via vault.
"""

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from models import OAuthToken, User
from utils import create_response, logs
from schema import OAuth2TokenStatusResponse
from http_client import get_http_client
from ssrf import assert_safe_url
import vault

router = APIRouter()

# Seconds of skew to refresh before actual expiry (avoids mid-request 401).
_REFRESH_SKEW_SECONDS = 30


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_auth_ref(client_id: str, scope: str, token_url: str) -> str:
    """What it does: Derive a 64-char hex cache key from the grant identity triple."""
    raw = f"{client_id}|{scope}|{token_url}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _token_expired(token: OAuthToken) -> bool:
    """What it does: Return True when the stored token is within REFRESH_SKEW_SECONDS of expiry."""
    if token.expires_at is None:
        return False
    now = datetime.now(timezone.utc)
    expires = token.expires_at.replace(tzinfo=timezone.utc) if token.expires_at.tzinfo is None else token.expires_at
    return expires <= now + timedelta(seconds=_REFRESH_SKEW_SECONDS)


async def _fetch_client_credentials(token_url: str, client_id: str, client_secret: str, scope: str) -> dict:
    """
    What it does: POST to token_url with client-credentials grant and return the parsed JSON response.
    Raises:
        ValueError: When the token endpoint returns a non-2xx status or missing access_token.
        RuntimeError: When the SSRF guard blocks the token_url.
    """
    assert_safe_url(token_url)
    client = get_http_client()
    payload = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
    }
    if scope:
        payload["scope"] = scope

    resp = await client.post(token_url, data=payload, timeout=15.0)
    if resp.status_code >= 400:
        raise ValueError(f"OAuth2 token endpoint returned {resp.status_code}: {resp.text[:200]}")

    data = resp.json()
    if "access_token" not in data:
        raise ValueError("OAuth2 response missing access_token")
    return data


async def _refresh_token(token_url: str, client_id: str, client_secret: str, refresh_token: str) -> dict:
    """
    What it does: POST to token_url with refresh_token grant and return the parsed JSON response.
    Raises:
        ValueError: When the token endpoint returns a non-2xx status or missing access_token.
    """
    assert_safe_url(token_url)
    client = get_http_client()
    payload = {
        "grant_type": "refresh_token",
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
    }
    resp = await client.post(token_url, data=payload, timeout=15.0)
    if resp.status_code >= 400:
        raise ValueError(f"OAuth2 refresh endpoint returned {resp.status_code}: {resp.text[:200]}")
    data = resp.json()
    if "access_token" not in data:
        raise ValueError("OAuth2 refresh response missing access_token")
    return data


def _upsert_token(existing: Optional[OAuthToken], grant_data: dict, owner_username: str, auth_ref: str) -> OAuthToken:
    """What it does: Populate or update an OAuthToken record from a grant response dict."""
    expires_at: Optional[datetime] = None
    if "expires_in" in grant_data:
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(grant_data["expires_in"]))

    raw_access = grant_data["access_token"]
    raw_refresh = grant_data.get("refresh_token")

    enc_access = vault.encrypt(raw_access) if not vault.is_ciphertext(raw_access) else raw_access
    enc_refresh = vault.encrypt(raw_refresh) if raw_refresh and not vault.is_ciphertext(raw_refresh) else raw_refresh

    if existing is None:
        return OAuthToken(
            owner_username=owner_username,
            auth_ref=auth_ref,
            access_token=enc_access,
            refresh_token=enc_refresh,
            token_type=grant_data.get("token_type", "Bearer"),
            expires_at=expires_at,
        )
    else:
        existing.access_token = enc_access
        existing.refresh_token = enc_refresh
        existing.token_type = grant_data.get("token_type", existing.token_type)
        existing.expires_at = expires_at
        return existing


# ---------------------------------------------------------------------------
# Request schemas (inline — small enough to avoid polluting schema.py)
# ---------------------------------------------------------------------------

class FetchTokenRequest(BaseModel):
    """Carry the OAuth2 grant config for fetching or refreshing a cached token.

    Attributes:
        grant: ``"client_credentials"`` (default) machine-to-machine; ``"authorization_code"`` → user-redirect.
        token_url: OAuth2 token endpoint URL.
        client_id: OAuth2 client identifier.
        client_secret: OAuth2 client secret (plaintext — encrypted server-side before storage).
        scope: Space-separated scope string; empty string when no scope is needed.
        force_refresh: ``True`` bypasses the cache and re-grants even when an unexpired token exists.
    """

    grant: str = "client_credentials"
    token_url: str
    client_id: str
    client_secret: str
    scope: str = ""
    force_refresh: bool = False


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/auth/oauth2/token")
async def fetch_oauth2_token(
    request: FetchTokenRequest,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch, cache, or refresh an OAuth2 access token for the caller; the raw token is never returned.
    Steps:
        - Step 1: Resolve user; reject unknown callers
        - Step 2: Derive auth_ref cache key from client_id + scope + token_url
        - Step 3: Load existing cached token; refresh if expired or force_refresh requested
        - Step 4: Grant a new token when no cache entry exists (client_credentials only for now)
        - Step 5: Persist the token record encrypted and return status metadata
    Notes:
        - authorization_code grant requires a separate browser redirect; this endpoint handles the token-exchange step after the callback sets the code.
    """
    try:
        # Step 1: Resolve user (column-pruned — only id needed for existence check)
        user_check = await db.execute(select(User.id).where(User.email == username))
        if user_check.scalar_one_or_none() is None:
            return create_response(401, error_message="User not found")

        # Step 2: Cache key
        auth_ref = _make_auth_ref(request.client_id, request.scope, request.token_url)

        # Step 3: Load existing cache entry
        result = await db.execute(
            select(OAuthToken).where(
                OAuthToken.owner_username == username,
                OAuthToken.auth_ref == auth_ref,
            )
        )
        existing = result.scalar_one_or_none()

        if existing and not request.force_refresh:
            if not _token_expired(existing):
                return create_response(200, {
                    "auth_ref": auth_ref,
                    "token_type": existing.token_type,
                    "expires_at": existing.expires_at.isoformat() if existing.expires_at else None,
                    "cached": True,
                }, OAuth2TokenStatusResponse)

        # Token expired or force_refresh — try refresh_token grant first
        if existing and existing.refresh_token:
            try:
                plain_refresh = vault.decrypt(existing.refresh_token)
                plain_secret = vault.decrypt(request.client_secret) if vault.is_ciphertext(request.client_secret) else request.client_secret
                grant_data = await _refresh_token(
                    request.token_url, request.client_id, plain_secret, plain_refresh
                )
                token = _upsert_token(existing, grant_data, username, auth_ref)
                await db.commit()
                return create_response(200, {
                    "auth_ref": auth_ref,
                    "token_type": token.token_type,
                    "expires_at": token.expires_at.isoformat() if token.expires_at else None,
                    "cached": False,
                    "refreshed": True,
                }, OAuth2TokenStatusResponse)
            except Exception as refresh_err:
                logs(f"oauth2 refresh failed for auth_ref={auth_ref}: {refresh_err}", type="error")

        # Step 4: Full grant (client_credentials)
        if request.grant != "client_credentials":
            return create_response(400, error_message="authorization_code grant requires browser redirect; use the callback flow")

        grant_data = await _fetch_client_credentials(
            request.token_url, request.client_id, request.client_secret, request.scope
        )

        # Step 5: Persist encrypted token
        token = _upsert_token(existing, grant_data, username, auth_ref)
        if existing is None:
            db.add(token)
        await db.commit()

        return create_response(200, {
            "auth_ref": auth_ref,
            "token_type": token.token_type,
            "expires_at": token.expires_at.isoformat() if token.expires_at else None,
            "cached": False,
            "refreshed": False,
        }, OAuth2TokenStatusResponse)

    except ValueError as e:
        await db.rollback()
        return create_response(400, error_message=str(e))


@router.get("/auth/oauth2/token/{auth_ref}")
async def get_oauth2_token_status(
    auth_ref: str,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """Return cached OAuth2 token status for the caller; never returns the raw access token."""
    user_check = await db.execute(select(User.id).where(User.email == username))
    if user_check.scalar_one_or_none() is None:
        return create_response(401, error_message="User not found")

    result = await db.execute(
        select(OAuthToken).where(
            OAuthToken.owner_username == username,
            OAuthToken.auth_ref == auth_ref,
        )
    )
    token = result.scalar_one_or_none()
    if not token:
        return create_response(404, error_message="No cached token for this auth_ref")

    return create_response(200, {
        "auth_ref": auth_ref,
        "token_type": token.token_type,
        "expires_at": token.expires_at.isoformat() if token.expires_at else None,
        "expired": _token_expired(token),
        "has_refresh_token": token.refresh_token is not None,
        "created_at": token.created_at.isoformat() if token.created_at else None,
    }, OAuth2TokenStatusResponse)
