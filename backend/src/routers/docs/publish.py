"""
What this file does: Provides publish/revoke endpoints for documentation (admin-gated) and a public no-auth read endpoint at /docs/{public_token}.
"""
import secrets
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from common_querys import has_min_role, resolve_workspace_access, write_audit
from config import get_db
from models import Node, PublishedDoc
from utils import create_response

router = APIRouter()


class PublishDocResponse(BaseModel):
    """Response for publish_docs — token and node reference.

    Attributes:
        doc_id: PublishedDoc primary key.
        node_id: Node the doc was generated from.
        public_token: Unguessable token for the public read URL.
    """

    doc_id: int
    node_id: int
    public_token: str


class PublicDocResponse(BaseModel):
    """Response for get_public_doc — full doc snapshot.

    Attributes:
        doc_id: PublishedDoc primary key.
        node_id: Node the doc was generated from.
        generated_by: Username of the last generator.
        generated_at: ISO timestamp of last generation (from created_at).
        content: Rendered doc model JSON; ``None`` when generation produced no content.
    """

    doc_id: int
    node_id: int
    generated_by: str
    generated_at: str
    content: Optional[Dict[str, Any]] = None


@router.post("/node/{node_id}/docs/publish")
async def publish_docs(
    node_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /node/{node_id}/docs/publish — assign a public token to a generated doc so it becomes publicly readable.

    Notes:
        - Idempotent: returns the existing token if already published; does not rotate it.
        - Requires a doc to have been generated first via POST /node/{node_id}/docs/generate.
    """
    node_row = (
        await db.execute(select(Node.id, Node.workspace_id).where(Node.id == node_id))
    ).first()
    if not node_row:
        return create_response(404, error_message="Node not found")

    access = await resolve_workspace_access(db, username, node_row.workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if not has_min_role(access, "admin"):
        return create_response(403, error_message="Admin access required to publish docs")

    doc_row = (
        await db.execute(
            select(PublishedDoc.id, PublishedDoc.public_token).where(PublishedDoc.node_id == node_id)
        )
    ).first()
    if not doc_row:
        return create_response(404, error_message="No generated doc found — run generate first")

    public_token = doc_row.public_token
    if not public_token:
        public_token = secrets.token_hex(32)
        await db.execute(
            update(PublishedDoc)
            .where(PublishedDoc.node_id == node_id)
            .values(public_token=public_token)
        )
        await write_audit(db, username, "doc.publish", "published_doc", doc_row.id, workspace_id=node_row.workspace_id)
        await db.commit()

    return create_response(200, data={
        "doc_id": doc_row.id,
        "node_id": node_id,
        "public_token": public_token,
    }, schema=PublishDocResponse)


@router.delete("/node/{node_id}/docs/publish")
async def revoke_docs(
    node_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """DELETE /node/{node_id}/docs/publish — revoke the public token; the doc becomes private again."""
    node_row = (
        await db.execute(select(Node.id, Node.workspace_id).where(Node.id == node_id))
    ).first()
    if not node_row:
        return create_response(404, error_message="Node not found")

    access = await resolve_workspace_access(db, username, node_row.workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if not has_min_role(access, "admin"):
        return create_response(403, error_message="Admin access required to revoke docs")

    doc_row = (
        await db.execute(select(PublishedDoc.id).where(PublishedDoc.node_id == node_id))
    ).first()
    if not doc_row:
        return create_response(404, error_message="No doc found for this node")

    await write_audit(db, username, "doc.revoke", "published_doc", doc_row.id, workspace_id=node_row.workspace_id)
    await db.execute(update(PublishedDoc).where(PublishedDoc.node_id == node_id).values(public_token=None))
    await db.commit()
    return create_response(200, message="Doc unpublished")


@router.get("/docs/{public_token}")
async def get_public_doc(
    public_token: str,
    db: AsyncSession = Depends(get_db),
):
    """GET /docs/{public_token} — return the published doc JSON; no authentication required; headers are never included.

    Notes:
        - Returns the snapshot from the last generate call — not live data.
    """
    row = (
        await db.execute(
            select(
                PublishedDoc.id,
                PublishedDoc.node_id,
                PublishedDoc.generated_by,
                PublishedDoc.created_at,
                PublishedDoc.content,
            ).where(PublishedDoc.public_token == public_token)
        )
    ).first()
    if not row:
        return create_response(404, error_message="Doc not found or not published")

    return create_response(200, data={
        "doc_id": row.id,
        "node_id": row.node_id,
        "generated_by": row.generated_by,
        "generated_at": str(row.created_at),
        "content": row.content,
    }, schema=PublicDocResponse)
