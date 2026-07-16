"""
What this file does: Exposes GET/POST/DELETE endpoints for managing user-scoped global variables and provides get_global_variables_for_user for internal use by the runner.
"""
import re as _re
from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, List, Optional
from pydantic import BaseModel, field_validator

from config import get_db
from common_querys import write_audit
from models import GlobalVariable, User
from utils import create_response, logs
from vault import encrypt as enc_secret, decrypt as dec_secret, is_ciphertext

router = APIRouter()

_KEY_RE = _re.compile(r"^[a-zA-Z0-9_-]+$")


class GlobalVariableItem(BaseModel):
    """A single global variable entry for bulk upsert.
    Attributes:
        key: Variable name used in ``{{key}}`` placeholder resolution; alphanumeric, underscore, hyphen only.
        value: Plaintext value stored and substituted at runtime.
        is_secret: When True, value is masked as ``***`` in list responses.
        description: Optional human-readable note; None when not provided.
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


class GlobalVariablesBulkSet(BaseModel):
    """Request body for POST /variables/global.
    Attributes:
        variables: List of variables to upsert; existing keys are updated, new keys are inserted.
    """
    variables: List[GlobalVariableItem]


@router.get("/variables/global")
async def list_global_variables(
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /variables/global — return all global variables for the user; secret values are masked as ***."""
    user_id = (await db.execute(select(User.id).where(User.email == username))).scalar_one_or_none()
    if user_id is None:
        return create_response(400, error_message="User not found")

    stmt = select(GlobalVariable).where(GlobalVariable.username == username).order_by(GlobalVariable.key)
    rows = (await db.execute(stmt)).scalars().all()

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


@router.post("/variables/global")
async def upsert_global_variables(
    payload: GlobalVariablesBulkSet,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /variables/global — bulk upsert global variables for the user; inserts new keys, updates existing ones."""
    user_id = (await db.execute(select(User.id).where(User.email == username))).scalar_one_or_none()
    if user_id is None:
        return create_response(400, error_message="User not found")

    if payload.variables:
        values = [
            {
                "username": username,
                "key": item.key,
                "value": enc_secret(item.value) if item.is_secret else item.value,
                "is_secret": item.is_secret,
                "description": item.description,
            }
            for item in payload.variables
        ]
        stmt = pg_insert(GlobalVariable).values(values)
        stmt = stmt.on_conflict_do_update(
            index_elements=["username", "key"],
            set_={
                "value": stmt.excluded.value,
                "is_secret": stmt.excluded.is_secret,
                "description": stmt.excluded.description,
            },
        )
        await db.execute(stmt)

    await db.commit()
    return create_response(200, message="Global variables saved")


@router.delete("/variables/global/{key}")
async def delete_global_variable(
    key: str,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """DELETE /variables/global/{key} — delete a single global variable by key; return 404 when the key does not exist."""
    user_id = (await db.execute(select(User.id).where(User.email == username))).scalar_one_or_none()
    if user_id is None:
        return create_response(400, error_message="User not found")

    result = await db.execute(
        delete(GlobalVariable).where(
            GlobalVariable.username == username,
            GlobalVariable.key == key,
        )
    )
    await db.commit()

    if result.rowcount == 0:
        return create_response(404, error_message="Variable not found")
    return create_response(200, message=f"Variable '{key}' deleted")


@router.get("/variables/global/{key}/reveal")
async def reveal_global_variable(
    key: str,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /variables/global/{key}/reveal — return decrypted value of a global secret variable; audit-logged."""
    user_id = (await db.execute(select(User.id).where(User.email == username))).scalar_one_or_none()
    if user_id is None:
        return create_response(401, error_message="User not found")

    row = (await db.execute(
        select(GlobalVariable).where(
            GlobalVariable.username == username,
            GlobalVariable.key == key,
        )
    )).scalar_one_or_none()

    if row is None:
        return create_response(404, error_message="Variable not found")

    try:
        value = dec_secret(row.value) if row.is_secret else row.value
    except ValueError:
        logs(f"Decrypt failed for global var reveal: key={key} user={username}", type="error")
        return create_response(409, error_message="Failed to decrypt secret value")

    await write_audit(
        db,
        username=username,
        action="global_variable.reveal",
        entity_type="global_variable",
        entity_id=row.id,
        metadata={"key": key},
    )
    await db.commit()

    return create_response(200, data={"key": key, "value": value, "is_secret": row.is_secret})


async def get_global_variables_for_user(username: str) -> Dict[str, str]:
    """
    What it does: Return all global variables for a user as a key→value mapping with raw (unmasked) values.
    Returns:
        dict[str, str]: Mapping of variable key to raw value; empty dict on error or when no variables exist.
    Notes:
        - Opens its own DB session so it can be called from the runner without an active request session.
    """
    from config import SessionLocal
    try:
        async with SessionLocal() as db:
            rows = (await db.execute(
                select(GlobalVariable.key, GlobalVariable.value, GlobalVariable.is_secret)
                .where(GlobalVariable.username == username)
            )).fetchall()
            out = {}
            for r in rows:
                try:
                    out[r.key] = dec_secret(r.value) if r.is_secret else r.value
                except ValueError:
                    logs(f"Failed to decrypt global var '{r.key}' for user '{username}'", type="error")
            return out
    except Exception:
        return {}
