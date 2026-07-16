"""
What this file does: Personal Access Token (PAT) endpoints — long-lived, revocable credentials a
user pastes into any MCP/agent client (Claude, Antigravity, Codex, CI). A PAT is exchanged for a
short-lived JWT at POST /pat/token, so the platform's existing JWT auth is untouched; the client
holds only the PAT and the MCP server silently re-exchanges when the JWT expires.

Management routes (create/list/revoke) require a normal JWT session; the exchange route is public
(the PAT itself is the credential).
"""

import hashlib
import secrets
from datetime import datetime

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from models import Cache, PersonalAccessToken, User
from utils import create_access_token, create_response

router = APIRouter()

PAT_PREFIX = "apipat_"


def _hash_token(raw: str) -> str:
    """What it does: Return the SHA-256 hex of a PAT for indexed lookup (safe: full-entropy token)."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class PATCreateRequest(BaseModel):
    """Request body for minting a PAT.

    Attributes:
        name: User-supplied label to identify the token later.
    """

    name: str


class PATCreatedResponse(BaseModel):
    """The one-time reveal of a freshly minted PAT.

    Attributes:
        id: PAT row id.
        name: Label supplied at creation.
        token: The raw token — shown once, never retrievable again.
    """

    id: int
    name: str
    token: str


class PATItem(BaseModel):
    """A PAT as listed for management (never includes the raw token).

    Attributes:
        id: PAT row id.
        name: Label.
        created_at: Creation timestamp.
        last_used_at: Last successful exchange; ``None`` until first use.
        revoked: Whether the token has been revoked.
        expires_at: Hard expiry; ``None`` when it never expires.
    """

    id: int
    name: str
    created_at: datetime
    last_used_at: datetime | None
    revoked: bool
    expires_at: datetime | None


class PATExchangeRequest(BaseModel):
    """Request body for exchanging a PAT for a JWT.

    Attributes:
        token: The raw PAT.
    """

    token: str


class PATExchangeResponse(BaseModel):
    """A JWT minted from a valid PAT.

    Attributes:
        access_token: Short-lived JWT for the Authorization header.
        username: Owner email, also required as the ``username`` header on platform calls.
    """

    access_token: str
    username: str


@router.post("/pat")
async def create_pat(
    body: PATCreateRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    """POST /pat — mint a long-lived PAT for the authenticated user; the raw token is returned once."""
    username = request.state.current_user

    raw = PAT_PREFIX + secrets.token_urlsafe(32)
    pat = PersonalAccessToken(
        username=username,
        name=body.name.strip() or "token",
        token_hash=_hash_token(raw),
    )
    db.add(pat)
    await db.commit()

    return create_response(
        201, {"id": pat.id, "name": pat.name, "token": raw}, PATCreatedResponse
    )


@router.get("/pat")
async def list_pats(request: Request, db: AsyncSession = Depends(get_db)):
    """GET /pat — list the authenticated user's PATs (metadata only, never the raw token)."""
    username = request.state.current_user

    result = await db.execute(
        select(
            PersonalAccessToken.id,
            PersonalAccessToken.name,
            PersonalAccessToken.created_at,
            PersonalAccessToken.last_used_at,
            PersonalAccessToken.revoked,
            PersonalAccessToken.expires_at,
        )
        .where(PersonalAccessToken.username == username)
        .order_by(PersonalAccessToken.created_at.desc())
    )
    rows = result.all()

    data = [
        {
            "id": r.id,
            "name": r.name,
            "created_at": r.created_at,
            "last_used_at": r.last_used_at,
            "revoked": r.revoked,
            "expires_at": r.expires_at,
        }
        for r in rows
    ]
    return create_response(200, data, PATItem)


@router.delete("/pat/{pat_id}")
async def revoke_pat(pat_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """DELETE /pat/{pat_id} — revoke one of the authenticated user's PATs."""
    username = request.state.current_user

    result = await db.execute(
        update(PersonalAccessToken)
        .where(and_(PersonalAccessToken.id == pat_id, PersonalAccessToken.username == username))
        .values(revoked=True)
    )
    if result.rowcount == 0:
        return create_response(404, error_message="Token not found")
    await db.commit()
    return create_response(200, message="Token revoked")


@router.post("/pat/token")
async def exchange_pat(body: PATExchangeRequest, db: AsyncSession = Depends(get_db)):
    """POST /pat/token — exchange a valid PAT for a fresh 7-day JWT (public route).

    Mirrors /sign_in's token issuance: verify the PAT, mint + cache a JWT, and record use.
    Invalid, revoked, or expired PATs return 401.
    """
    token_hash = _hash_token(body.token)
    result = await db.execute(
        select(
            PersonalAccessToken.revoked,
            PersonalAccessToken.expires_at,
            PersonalAccessToken.username,
            User.is_active,
        )
        .join(User, User.username == PersonalAccessToken.username)
        .where(PersonalAccessToken.token_hash == token_hash)
    )
    pat = result.one_or_none()

    now = datetime.now()
    if (
        pat is None
        or pat.revoked
        or not pat.is_active
        or (pat.expires_at is not None and pat.expires_at < now)
    ):
        return create_response(401, error_message="Invalid or revoked token")

    access_token = await create_access_token(
        data={"username": pat.username}, expires_delta=relativedelta(days=7)
    )
    db.add(Cache(username=pat.username, token=access_token, timestamp=now))
    await db.execute(
        update(PersonalAccessToken)
        .where(PersonalAccessToken.token_hash == token_hash)
        .values(last_used_at=now)
    )
    await db.commit()

    return create_response(
        200, {"access_token": access_token, "username": pat.username}, PATExchangeResponse
    )
