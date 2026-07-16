"""
What this file does: Exposes GET/PUT/DELETE endpoints for collection-scoped variables attached to a node (folder or file); secrets are encrypted at rest via the vault.
"""

import re as _re
from typing import List, Optional

from fastapi import APIRouter, Depends, Header
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, field_validator

from config import get_db
from common_querys import has_min_role, resolve_node_access, write_audit
from models import CollectionVariable
from utils import ExceptionHandler, create_response, logs
from vault import encrypt as enc_secret, decrypt as dec_secret

router = APIRouter()

_KEY_RE = _re.compile(r"^[a-zA-Z0-9_-]+$")


class CollectionVariableItem(BaseModel):
    """A single collection variable entry for bulk upsert.

    Attributes:
        key: Variable name used in ``{{key}}`` placeholder resolution; alphanumeric, underscore, hyphen only.
        value: Plaintext value; encrypted when is_secret is ``True``.
        is_secret: ``True`` masks value in list responses and encrypts at rest.
        description: Optional note; ``None`` when not provided.
    """

    key: str
    value: str
    is_secret: bool = False
    description: Optional[str] = None

    @field_validator("key")
    @classmethod
    def validate_key(cls, v: str) -> str:
        if not v or len(v) > 255:
            raise ValueError("key must be 1–255 characters")
        if not _KEY_RE.match(v):
            raise ValueError("key must match ^[a-zA-Z0-9_-]+$")
        return v


class CollectionVariablesBulkSet(BaseModel):
    """Request body for PUT /node/{node_id}/variables.

    Attributes:
        variables: Variables to upsert; existing keys updated, new keys inserted.
    """

    variables: List[CollectionVariableItem]


@router.get("/node/{node_id}/variables")
async def list_collection_variables(
    node_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /node/{node_id}/variables — list all collection variables for the node; secrets masked as ***."""
    try:
        na = await resolve_node_access(db, username, node_id)
        if na.user is None:
            return create_response(401, error_message="User not found")
        if not na.can_access:
            return create_response(403, error_message="Access denied")

        result = await db.execute(
            select(
                CollectionVariable.id,
                CollectionVariable.key,
                CollectionVariable.value,
                CollectionVariable.is_secret,
                CollectionVariable.description,
                CollectionVariable.created_at,
            )
            .where(CollectionVariable.node_id == node_id)
            .order_by(CollectionVariable.key)
        )
        rows = result.all()

        data = [
            {
                "id": r.id,
                "key": r.key,
                "value": "***" if r.is_secret else r.value,
                "is_secret": r.is_secret,
                "description": r.description,
                "created_at": str(r.created_at),
            }
            for r in rows
        ]
        return create_response(200, data=data)
    except Exception as e:
        return ExceptionHandler(e)


@router.put("/node/{node_id}/variables")
async def upsert_collection_variables(
    node_id: int,
    payload: CollectionVariablesBulkSet,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """PUT /node/{node_id}/variables — bulk upsert collection variables; requires editor role."""
    try:
        na = await resolve_node_access(db, username, node_id)
        if na.user is None:
            return create_response(401, error_message="User not found")
        if na.node is None:
            return create_response(404, error_message="Node not found")
        # Role already in joined result — no extra query needed
        if not has_min_role(na, "editor"):
            return create_response(403, error_message="Access denied")

        if not payload.variables:
            return create_response(200, message="Collection variables saved")

        # Single ON CONFLICT DO UPDATE per batch replaces the N+1 SELECT+INSERT loop
        rows = [
            {
                "node_id": node_id,
                "key": item.key,
                "value": enc_secret(item.value) if item.is_secret else item.value,
                "is_secret": item.is_secret,
                "description": item.description,
            }
            for item in payload.variables
        ]
        stmt = pg_insert(CollectionVariable).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["node_id", "key"],
            set_={
                "value": stmt.excluded.value,
                "is_secret": stmt.excluded.is_secret,
                "description": stmt.excluded.description,
            },
        )
        await db.execute(stmt)
        await db.commit()
        return create_response(200, message="Collection variables saved")
    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)


@router.delete("/node/{node_id}/variables/{key}")
async def delete_collection_variable(
    node_id: int,
    key: str,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """DELETE /node/{node_id}/variables/{key} — delete a single collection variable; 404 when key not found."""
    try:
        na = await resolve_node_access(db, username, node_id)
        if na.user is None:
            return create_response(401, error_message="User not found")
        if na.node is None:
            return create_response(404, error_message="Node not found")
        if not has_min_role(na, "editor"):
            return create_response(403, error_message="Access denied")

        result = await db.execute(
            delete(CollectionVariable).where(
                CollectionVariable.node_id == node_id,
                CollectionVariable.key == key,
            )
        )
        await db.commit()

        if result.rowcount == 0:
            return create_response(404, error_message="Variable not found")
        return create_response(200, message=f"Variable '{key}' deleted")
    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)


@router.get("/node/{node_id}/variables/{key}/reveal")
async def reveal_collection_variable(
    node_id: int,
    key: str,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /node/{node_id}/variables/{key}/reveal — return decrypted value for a secret variable; audit-logged."""
    try:
        na = await resolve_node_access(db, username, node_id)
        if na.user is None:
            return create_response(401, error_message="User not found")
        if not na.can_access:
            return create_response(403, error_message="Access denied")

        result = await db.execute(
            select(
                CollectionVariable.id,
                CollectionVariable.key,
                CollectionVariable.value,
                CollectionVariable.is_secret,
            )
            .where(
                CollectionVariable.node_id == node_id,
                CollectionVariable.key == key,
            )
        )
        row = result.one_or_none()

        if row is None:
            return create_response(404, error_message="Variable not found")

        try:
            value = dec_secret(row.value) if row.is_secret else row.value
        except ValueError:
            logs(f"Decrypt failed for collection var reveal: node={node_id} key={key} user={username}", type="error")
            return create_response(409, error_message="Failed to decrypt secret value")

        await write_audit(
            db,
            username=username,
            action="collection_variable.reveal",
            entity_type="collection_variable",
            entity_id=row.id,
            workspace_id=na.node.workspace_id,
            metadata={"node_id": node_id, "key": key},
        )
        await db.commit()

        return create_response(200, data={"key": key, "value": value, "is_secret": row.is_secret})
    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
