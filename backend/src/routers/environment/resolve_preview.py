"""
What this file does: Exposes GET /resolve/preview that resolves {{VAR}} placeholders in a text string against the full 4-scope chain (global→collection→env→local) and returns the winning scope per variable; secret values are always masked.
"""

import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from common_querys import (
    build_scope_chain,
    get_collection_variables,
    get_user_by_username,
    verify_node_ownership,
)
from config import get_db
from models import Node
from utils import ExceptionHandler, create_response, resolve_variables
from vault import decrypt as dec_secret

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
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(401, error_message="User not found")

        # Verify user has at least viewer access to the node's workspace
        node = await verify_node_ownership(db, payload.file_id, user.id)
        if not node:
            return create_response(403, error_message="Access denied")

        # Resolve workspace_id from node
        from sqlalchemy import select
        ws_result = await db.execute(select(Node.workspace_id).where(Node.id == payload.file_id))
        workspace_id = ws_result.scalar_one_or_none()

        # Build each individual scope so we can show which scope owns each variable
        from routers.variables.global_variables import get_global_variables_for_user
        from utils import get_environment_variables
        from models import Environment

        global_vars = await get_global_variables_for_user(username)
        collection_vars = await get_collection_variables(db, payload.file_id)

        env_vars: Dict[str, Any] = {}
        env_result = await db.execute(
            select(Environment).where(
                Environment.workspace_id == workspace_id,
                Environment.is_active == True,
            )
        )
        active_env = env_result.scalar_one_or_none()
        if active_env and active_env.variables:
            env_vars = dict(active_env.variables)

        local_vars: Dict[str, Any] = payload.local_context or {}

        # Determine which vars are secret (must not be returned in value)
        from sqlalchemy import select as sa_select
        from models import CollectionVariable, GlobalVariable

        secret_keys: set = set()

        gv_result = await db.execute(
            sa_select(GlobalVariable.key).where(
                GlobalVariable.username == username,
                GlobalVariable.is_secret == True,
            )
        )
        for (k,) in gv_result.fetchall():
            secret_keys.add(k)

        # Fetch all ancestor node ids for collection var secret check
        from common_querys import get_folder_path_to_root
        path = await get_folder_path_to_root(db, payload.file_id)
        if path:
            node_ids = [n["id"] for n in path]
            cv_result = await db.execute(
                sa_select(CollectionVariable.key).where(
                    CollectionVariable.node_id.in_(node_ids),
                    CollectionVariable.is_secret == True,
                )
            )
            for (k,) in cv_result.fetchall():
                secret_keys.add(k)

        # Extract variable names from text
        var_names = _VAR_RE.findall(payload.text)

        # Build per-variable resolution info
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
            # Check from highest priority to lowest
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

        # Build full merged scope for substitution (real values, not masked)
        from utils import merge_scopes
        full_scope = merge_scopes(global_vars, collection_vars, env_vars, local_vars)
        resolved_text = resolve_variables(payload.text, full_scope)

        return create_response(200, data={
            "original_text": payload.text,
            "resolved_text": resolved_text,
            "variables": var_details,
        })
    except Exception as e:
        return ExceptionHandler(e)
