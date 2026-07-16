"""
What this file does: Exposes PUT /api/{api_id}/auth for storing per-API auth config in Api.extra_meta.auth; secret fields are encrypted via vault before persistence.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import ROLE_ORDER, write_audit
from models import Api, Node, User, Workspace, WorkspaceMember
from schema import SetAuthRequest, SetAuthResponse
from utils import ExceptionHandler, create_response
import vault

router = APIRouter()

# Secret fields per auth type that must be encrypted before storage.
_SECRET_FIELDS: dict[str, list[str]] = {
    "apikey":      ["value"],
    "bearer":      ["token"],
    "basic":       ["password"],
    "aws_sigv4":   ["secret_key"],
    "jwt":         ["secret"],
    "oauth2":      ["client_secret"],
    "none":        [],
}


def _encrypt_secrets(auth_type: str, config: dict) -> dict:
    """What it does: Return a copy of config with all secret fields encrypted."""
    secret_keys = _SECRET_FIELDS.get(auth_type, [])
    if not secret_keys:
        return config
    out = dict(config)
    for field in secret_keys:
        if field in out and out[field] and not vault.is_ciphertext(str(out[field])):
            out[field] = vault.encrypt(str(out[field]))
    return out


@router.put("/api/{api_id}/auth")
async def set_api_auth(
    api_id: int,
    request: SetAuthRequest,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Store or replace the auth config on an API; secret fields are encrypted before persistence.
    Steps:
        - Step 1: Resolve caller, target Api, its workspace, and the caller's role in one query
        - Step 2: Verify viewer access, then editor access, from the already-joined role
        - Step 3: Encrypt secret fields in the config dict
        - Step 4: Merge the auth block into Api.extra_meta and commit
    """
    try:
        # Step 1: Resolve caller + api + workspace + membership in one round trip
        stmt = (
            select(User, Api, Node.workspace_id, Workspace.user_id, WorkspaceMember.role)
            .select_from(User)
            .outerjoin(Api, Api.id == api_id)
            .outerjoin(Node, Node.id == Api.file_id)
            .outerjoin(Workspace, Workspace.id == Node.workspace_id)
            .outerjoin(
                WorkspaceMember,
                and_(
                    WorkspaceMember.workspace_id == Workspace.id,
                    WorkspaceMember.user_id == User.id,
                    WorkspaceMember.joined_at.isnot(None),
                ),
            )
            .where(User.email == username)
        )
        row = (await db.execute(stmt)).first()
        if row is None:
            return create_response(401, error_message="User not found")
        user, api, ws_id, ws_owner_id, member_role = row
        if api is None:
            return create_response(404, error_message="API not found")

        # Step 2: Viewer then editor checks from the joined role — no extra queries
        is_owner = ws_owner_id == user.id
        member_rank = ROLE_ORDER.get(member_role, -1)
        if not (is_owner or member_rank >= 0):
            return create_response(403, error_message="Access denied")
        if not (is_owner or member_rank >= ROLE_ORDER["editor"]):
            return create_response(403, error_message="Editor access or higher required")

        # Step 3: Encrypt secret fields
        encrypted_config = _encrypt_secrets(request.type, request.config)

        # Step 4: Merge auth block into extra_meta (leave all other keys untouched)
        current_meta = dict(api.extra_meta or {})
        current_meta["auth"] = {"type": request.type, "config": encrypted_config}
        api.extra_meta = current_meta

        await write_audit(
            db,
            username=user.username,
            action="api.set_auth",
            entity_type="api",
            entity_id=api.id,
            workspace_id=ws_id,
            metadata={"auth_type": request.type},
        )
        await db.commit()

        return create_response(200, {"api_id": api_id, "auth_type": request.type}, SetAuthResponse)

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
