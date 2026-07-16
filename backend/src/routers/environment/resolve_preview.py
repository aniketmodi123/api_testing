"""
What this file does: Exposes GET /resolve/preview that resolves {{VAR}} placeholders in a text string against the full 4-scope chain (global→collection→env→local) and returns the winning scope per variable; secret values are always masked.
"""

import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from common_querys import (
    get_collection_variables_with_secrets,
    resolve_node_access,
)
from config import get_db
from models import Environment, GlobalVariable
from schema import ResolvePreviewResponse
from utils import create_response, merge_scopes, resolve_variables, value_correction

router = APIRouter()

_VAR_RE = re.compile(r"\{\{([a-zA-Z_\$][a-zA-Z0-9_\-\$]*)\}\}")


class ResolvePreviewRequest(BaseModel):
    """Request body for GET /resolve/preview.

    Attributes:
        text: Template string containing ``{{VAR}}`` placeholders to resolve.
        file_id: File node whose ancestor chain + workspace provides the scope chain.
        local_context: Optional run-time local variables (e.g. from a flow step); ``None`` when not applicable.
    """

    text: str
    file_id: int
    local_context: Optional[Dict[str, Any]] = None


@router.post("/resolve/preview")
async def resolve_preview(
    payload: ResolvePreviewRequest,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /resolve/preview — resolve text against full scope chain; return resolved text + per-variable scope info; secrets masked."""
    access = await resolve_node_access(db, username, payload.file_id)
    if not access.user:
        return create_response(401, error_message="User not found")
    if not access.can_access:
        return create_response(403, error_message="Access denied")

    workspace_id: int = access.node.workspace_id

    # Lazy import avoids circular dependency with global_variables module.
    from routers.variables.global_variables import get_global_variables_for_user

    global_vars = await get_global_variables_for_user(username)

    # Single path walk: fetches collection vars + secret keys in one round trip.
    collection_vars, cv_secret_keys = await get_collection_variables_with_secrets(db, payload.file_id)

    env_vars: Dict[str, Any] = {}
    env_row = (await db.execute(
        select(Environment.variables).where(
            Environment.workspace_id == workspace_id,
            Environment.is_active == True,
        )
    )).scalar_one_or_none()
    if env_row:
        env_vars = dict(env_row)

    local_vars: Dict[str, Any] = payload.local_context or {}

    secret_keys: set = set(cv_secret_keys)

    gv_result = await db.execute(
        select(GlobalVariable.key).where(
            GlobalVariable.username == username,
            GlobalVariable.is_secret == True,
        )
    )
    for (k,) in gv_result.fetchall():
        secret_keys.add(k)

    var_names = _VAR_RE.findall(payload.text)

    scope_priority = [
        ("local", local_vars),
        ("environment", env_vars),
        ("collection", collection_vars),
        ("global", global_vars),
    ]

    var_details: List[Dict[str, Any]] = []
    seen: set = set()
    for var_name in var_names:
        if var_name in seen:
            continue
        seen.add(var_name)

        winning_scope = None
        winning_value = None
        for scope_name, scope_dict in scope_priority:
            if var_name in scope_dict:
                winning_scope = scope_name
                winning_value = scope_dict[var_name]
                break

        is_secret = var_name in secret_keys
        var_details.append({
            "name": var_name,
            "scope": winning_scope,
            "value": "***" if (is_secret and winning_value is not None) else winning_value,
            "resolved": winning_value is not None,
            "is_secret": is_secret,
        })

    full_scope = merge_scopes(global_vars, collection_vars, env_vars, local_vars)
    resolved_text = resolve_variables(payload.text, full_scope)

    return create_response(200, value_correction({
        "original_text": payload.text,
        "resolved_text": resolved_text,
        "variables": var_details,
    }), ResolvePreviewResponse)
