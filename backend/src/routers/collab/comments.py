"""
What this file does: Provides comment CRUD endpoints — create threaded comments on any entity (node, api, api_case, flow) and delete own or (as admin) any comment.
"""

from typing import Literal, Optional

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from common_querys import resolve_workspace_access, has_min_role, write_audit
from config import get_db
from models import Comment
from utils import create_response

router = APIRouter()

ENTITY_TYPES = ("node", "api", "api_case", "flow")


class CommentCreate(BaseModel):
    entity_type: Literal["node", "api", "api_case", "flow"]
    entity_id: int
    body: str
    parent_id: Optional[int] = None


class CommentResponse(BaseModel):
    """Serialized comment row returned by create and list endpoints.

    Attributes:
        id: Primary key of the comment.
        workspace_id: Workspace the comment belongs to.
        entity_type: Entity kind the comment is attached to — ``"node"``, ``"api"``, ``"api_case"``, or ``"flow"``.
        entity_id: Numeric id of the commented entity.
        author_username: Email of the user who posted the comment.
        body: Comment text content.
        parent_id: Parent comment id for threaded replies; ``None`` for top-level comments.
        created_at: ISO timestamp when the comment was posted; ``None`` if unset.
    """

    id: int
    workspace_id: int
    entity_type: str
    entity_id: int
    author_username: str
    body: str
    parent_id: Optional[int] = None
    created_at: Optional[str] = None


@router.post("/workspace/{workspace_id}/comment")
async def create_comment(
    workspace_id: int,
    payload: CommentCreate,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /workspace/{workspace_id}/comment — add a comment (or threaded reply) to any entity in the workspace.

    Notes:
        - Comments are immutable after creation; delete and re-post to correct.
        - parent_id must refer to a comment in the same workspace.
    """
    access = await resolve_workspace_access(db, username, workspace_id)
    if access.user is None:
        return create_response(400, error_message="User not found")
    if not has_min_role(access, "editor"):
        return create_response(403, error_message="Editor access required")

    if payload.parent_id is not None:
        parent_exists = (await db.execute(
            select(Comment.id).where(
                Comment.id == payload.parent_id,
                Comment.workspace_id == workspace_id,
            )
        )).scalar_one_or_none()
        if parent_exists is None:
            return create_response(400, error_message="Parent comment not found in this workspace")

    comment = Comment(
        workspace_id=workspace_id,
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        author_username=username,
        body=payload.body,
        parent_id=payload.parent_id,
    )
    db.add(comment)
    await db.flush()
    await write_audit(db, username, "comment.create", "comment", comment.id, workspace_id=workspace_id)
    await db.commit()

    return create_response(201, data=_comment_dict(comment), schema=CommentResponse)


@router.get("/workspace/{workspace_id}/comments")
async def list_comments(
    workspace_id: int,
    entity_type: str,
    entity_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /workspace/{workspace_id}/comments — list all comments for an entity, ordered oldest first.

    Notes:
        - Returns a flat list; UI builds the thread tree from parent_id.
    """
    access = await resolve_workspace_access(db, username, workspace_id)
    if access.user is None:
        return create_response(400, error_message="User not found")

    if entity_type not in ENTITY_TYPES:
        return create_response(400, error_message=f"entity_type must be one of {ENTITY_TYPES}")

    if not access.can_access:
        return create_response(403, error_message="Access denied")

    comments = (await db.execute(
        select(Comment)
        .where(
            Comment.workspace_id == workspace_id,
            Comment.entity_type == entity_type,
            Comment.entity_id == entity_id,
        )
        .order_by(Comment.created_at.asc())
    )).scalars().all()

    return create_response(200, data=[_comment_dict(c) for c in comments], schema=CommentResponse)


@router.delete("/comment/{comment_id}")
async def delete_comment(
    comment_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """DELETE /comment/{comment_id} — delete a comment; only the author or a workspace admin may delete.

    Notes:
        - Children of a deleted comment have parent_id set to NULL (SET NULL cascade), not deleted.
    """
    comment_row = (await db.execute(
        select(Comment.workspace_id, Comment.author_username).where(Comment.id == comment_id)
    )).first()
    if not comment_row:
        return create_response(404, error_message="Comment not found")

    access = await resolve_workspace_access(db, username, comment_row.workspace_id)
    if access.user is None:
        return create_response(400, error_message="User not found")
    if not access.can_access:
        return create_response(403, error_message="Access denied")

    is_author = comment_row.author_username == username
    if not is_author and not has_min_role(access, "admin"):
        return create_response(403, error_message="Only the comment author or a workspace admin may delete this comment")

    await db.execute(delete(Comment).where(Comment.id == comment_id))
    await write_audit(db, username, "comment.delete", "comment", comment_id, workspace_id=comment_row.workspace_id)
    await db.commit()

    return create_response(200, message="Comment deleted")


def _comment_dict(c: Comment) -> dict:
    """What it does: Serialize a Comment ORM row to a plain dict for API responses."""
    return {
        "id": c.id,
        "workspace_id": c.workspace_id,
        "entity_type": c.entity_type,
        "entity_id": c.entity_id,
        "author_username": c.author_username,
        "body": c.body,
        "parent_id": c.parent_id,
        "created_at": str(c.created_at) if c.created_at else None,
    }
