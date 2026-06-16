"""
What this file does: Exposes GET/PUT/DELETE endpoints for collection-scoped variables attached to a node (folder or file); secrets are encrypted at rest via the vault.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from pydantic import BaseModel

from config import get_db
from common_querys import get_user_by_username, verify_node_ownership, can_access_workspace
from models import CollectionVariable, Node
from utils import ExceptionHandler, create_response, logs
from vault import encrypt as enc_secret, decrypt as dec_secret

router = APIRouter()


class CollectionVariableItem(BaseModel):
    """A single collection variable entry for bulk upsert.

    Attributes:
        key: Variable name used in ``{{key}}`` placeholder resolution.
        value: Plaintext value; encrypted when is_secret is ``True``.
        is_secret: ``True`` masks value in list responses and encrypts at rest.
        description: Optional note; ``None`` when not provided.
    """

    key: str
    value: str
    is_secret: bool = False
    description: Optional[str] = None


class CollectionVariablesBulkSet(BaseModel):
    """Request body for PUT /node/{node_id}/variables.

    Attributes:
        variables: Variables to upsert; existing keys updated, new keys inserted.
    """

    variables: List[CollectionVariableItem]


async def _get_workspace_id(db: AsyncSession, node_id: int) -> Optional[int]:
    """What it does: Return the workspace_id for a node, or None if not found."""
    result = await db.execute(select(Node.workspace_id).where(Node.id == node_id))
    return result.scalar_one_or_none()


@router.get("/node/{node_id}/variables")
async def list_collection_variables(
    node_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /node/{node_id}/variables — list all collection variables for the node; secrets masked as ***."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(401, error_message="User not found")

        node = await verify_node_ownership(db, node_id, user.id)
        if not node:
            return create_response(403, error_message="Access denied")

        stmt = select(CollectionVariable).where(CollectionVariable.node_id == node_id).order_by(CollectionVariable.key)
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


@router.put("/node/{node_id}/variables")
async def upsert_collection_variables(
    node_id: int,
    payload: CollectionVariablesBulkSet,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """PUT /node/{node_id}/variables — bulk upsert collection variables; requires editor role."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(401, error_message="User not found")

        workspace_id = await _get_workspace_id(db, node_id)
        if workspace_id is None:
            return create_response(404, error_message="Node not found")

        ok = await can_access_workspace(db, workspace_id, user.id, min_role="editor")
        if not ok:
            return create_response(403, error_message="Access denied")

        for item in payload.variables:
            stmt = select(CollectionVariable).where(
                CollectionVariable.node_id == node_id,
                CollectionVariable.key == item.key,
            )
            result = await db.execute(stmt)
            existing = result.scalar_one_or_none()

            stored_value = enc_secret(item.value) if item.is_secret else item.value

            if existing:
                existing.value = stored_value
                existing.is_secret = item.is_secret
                existing.description = item.description
            else:
                db.add(CollectionVariable(
                    node_id=node_id,
                    key=item.key,
                    value=stored_value,
                    is_secret=item.is_secret,
                    description=item.description,
                ))

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
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(401, error_message="User not found")

        workspace_id = await _get_workspace_id(db, node_id)
        if workspace_id is None:
            return create_response(404, error_message="Node not found")

        ok = await can_access_workspace(db, workspace_id, user.id, min_role="editor")
        if not ok:
            return create_response(403, error_message="Access denied")

        stmt = delete(CollectionVariable).where(
            CollectionVariable.node_id == node_id,
            CollectionVariable.key == key,
        )
        result = await db.execute(stmt)
        await db.commit()

        if result.rowcount == 0:
            return create_response(404, error_message="Variable not found")
        return create_response(200, message=f"Variable '{key}' deleted")
    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
