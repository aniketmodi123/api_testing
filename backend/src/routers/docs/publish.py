"""
What this file does: Provides publish/revoke endpoints for documentation (admin-gated) and a public no-auth read endpoint at /docs/{public_token}.
"""
import secrets

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from common_querys import can_access_workspace, get_user_by_username, write_audit
from config import get_db
from models import Node, PublishedDoc
from utils import ExceptionHandler, create_response

router = APIRouter()


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
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        node = (await db.execute(select(Node).where(Node.id == node_id))).scalar_one_or_none()
        if not node:
            return create_response(404, error_message="Node not found")

        access = await can_access_workspace(db, node.workspace_id, user.id, min_role="admin")
        if not access:
            return create_response(403, error_message="Admin access required to publish docs")

        doc = (
            await db.execute(select(PublishedDoc).where(PublishedDoc.node_id == node_id))
        ).scalar_one_or_none()
        if not doc:
            return create_response(404, error_message="No generated doc found — run generate first")

        if not doc.public_token:
            doc.public_token = secrets.token_hex(32)
            await write_audit(db, username, "doc.publish", "published_doc", doc.id, workspace_id=node.workspace_id)
            await db.commit()
            await db.refresh(doc)

        return create_response(200, data={
            "doc_id": doc.id,
            "node_id": node_id,
            "public_token": doc.public_token,
        })
    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)


@router.delete("/node/{node_id}/docs/publish")
async def revoke_docs(
    node_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """DELETE /node/{node_id}/docs/publish — revoke the public token; the doc becomes private again."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        node = (await db.execute(select(Node).where(Node.id == node_id))).scalar_one_or_none()
        if not node:
            return create_response(404, error_message="Node not found")

        access = await can_access_workspace(db, node.workspace_id, user.id, min_role="admin")
        if not access:
            return create_response(403, error_message="Admin access required to revoke docs")

        doc = (
            await db.execute(select(PublishedDoc).where(PublishedDoc.node_id == node_id))
        ).scalar_one_or_none()
        if not doc:
            return create_response(404, error_message="No doc found for this node")

        doc.public_token = None
        await write_audit(db, username, "doc.revoke", "published_doc", doc.id, workspace_id=node.workspace_id)
        await db.commit()
        return create_response(200, message="Doc unpublished")
    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)


@router.get("/docs/{public_token}")
async def get_public_doc(
    public_token: str,
    db: AsyncSession = Depends(get_db),
):
    """GET /docs/{public_token} — return the published doc JSON; no authentication required; headers are never included.

    Notes:
        - Returns the snapshot from the last generate call — not live data.
    """
    try:
        doc = (
            await db.execute(
                select(PublishedDoc).where(PublishedDoc.public_token == public_token)
            )
        ).scalar_one_or_none()

        if not doc:
            return create_response(404, error_message="Doc not found or not published")

        return create_response(200, data={
            "doc_id": doc.id,
            "node_id": doc.node_id,
            "generated_by": doc.generated_by,
            "generated_at": str(doc.created_at),
            "content": doc.content,
        })
    except Exception as e:
        return ExceptionHandler(e)
