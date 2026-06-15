"""
What this file does: Exposes GET/POST/DELETE endpoints for managing user-scoped global variables and provides get_global_variables_for_user for internal use by the runner.
"""
from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, List, Optional
from pydantic import BaseModel

from config import get_db
from common_querys import get_user_by_username
from models import GlobalVariable
from utils import ExceptionHandler, create_response, logs
from vault import encrypt as enc_secret, decrypt as dec_secret, is_ciphertext

router = APIRouter()


class GlobalVariableItem(BaseModel):
    """A single global variable entry for bulk upsert.
    Attributes:
        key: Variable name used in ``{{key}}`` placeholder resolution.
        value: Plaintext value stored and substituted at runtime.
        is_secret: When True, value is masked as ``***`` in list responses.
        description: Optional human-readable note; None when not provided.
    """
    key: str
    value: str
    is_secret: bool = False
    description: Optional[str] = None


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
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        stmt = select(GlobalVariable).where(GlobalVariable.username == user.username).order_by(GlobalVariable.key)
        result = await db.execute(stmt)
        rows = result.scalars().all()

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


@router.post("/variables/global")
async def upsert_global_variables(
    payload: GlobalVariablesBulkSet,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /variables/global — bulk upsert global variables for the user; inserts new keys, updates existing ones."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        for item in payload.variables:
            stmt = select(GlobalVariable).where(
                GlobalVariable.username == user.username,
                GlobalVariable.key == item.key,
            )
            result = await db.execute(stmt)
            existing = result.scalar_one_or_none()

            # Encrypt when secret; re-encrypt when flag flips from plaintext to secret.
            stored_value = enc_secret(item.value) if item.is_secret else item.value

            if existing:
                existing.value = stored_value
                existing.is_secret = item.is_secret
                existing.description = item.description
            else:
                db.add(GlobalVariable(
                    username=user.username,
                    key=item.key,
                    value=stored_value,
                    is_secret=item.is_secret,
                    description=item.description,
                ))

        await db.commit()
        return create_response(200, message="Global variables saved")
    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)


@router.delete("/variables/global/{key}")
async def delete_global_variable(
    key: str,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """DELETE /variables/global/{key} — delete a single global variable by key; return 404 when the key does not exist."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        stmt = delete(GlobalVariable).where(
            GlobalVariable.username == user.username,
            GlobalVariable.key == key,
        )
        result = await db.execute(stmt)
        await db.commit()

        if result.rowcount == 0:
            return create_response(404, error_message="Variable not found")
        return create_response(200, message=f"Variable '{key}' deleted")
    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)


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
            stmt = select(GlobalVariable).where(GlobalVariable.username == username)
            result = await db.execute(stmt)
            rows = result.scalars().all()
            out = {}
            for r in rows:
                try:
                    out[r.key] = dec_secret(r.value) if r.is_secret else r.value
                except ValueError:
                    logs(f"Failed to decrypt global var '{r.key}' for user '{username}'", type="error")
            return out
    except Exception:
        return {}
