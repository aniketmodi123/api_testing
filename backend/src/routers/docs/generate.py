"""
What this file does: Generates a documentation snapshot for a node and its subtree; upserts a PublishedDoc row with the rendered API + case model.
"""
from datetime import datetime
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from common_querys import has_min_role, resolve_workspace_access
from config import get_db
from models import Api, ApiCase, Node, PublishedDoc
from utils import create_response

router = APIRouter()


class GenerateDocResponse(BaseModel):
    """Response for generate_docs — counts and metadata for the upserted snapshot.

    Attributes:
        doc_id: PublishedDoc primary key.
        node_id: Root node the doc was generated from.
        api_count: Number of active APIs included in the snapshot.
        case_count: Total test cases across all included APIs.
        generated_at: ISO timestamp string of generation.
        is_published: ``True`` when a public token exists for this doc.
    """

    doc_id: int
    node_id: int
    api_count: int
    case_count: int
    generated_at: str
    is_published: bool


async def _walk_subtree(db: AsyncSession, root_node_id: int) -> List[int]:
    """What it does: Return IDs of root node and all descendant nodes via recursive CTE in a single query."""
    cte = select(Node.id).where(Node.id == root_node_id).cte(name="subtree", recursive=True)
    recursive = select(Node.id).where(Node.parent_id == cte.c.id)
    cte = cte.union_all(recursive)
    return (await db.execute(select(cte.c.id))).scalars().all()


async def _build_doc_content(db: AsyncSession, node_name: str, node_ids: List[int]) -> Dict[str, Any]:
    """What it does: Build the doc model JSON from all active APIs and cases within the given node IDs."""
    api_rows = (
        await db.execute(
            select(Api.id, Api.name, Api.method, Api.endpoint, Api.description)
            .where(Api.file_id.in_(node_ids), Api.is_active == True)
            .order_by(Api.id)
        )
    ).fetchall()

    cases_by_api: Dict[int, List[Dict[str, Any]]] = {}
    if api_rows:
        api_ids = [r.id for r in api_rows]
        for row in (
            await db.execute(
                select(ApiCase.api_id, ApiCase.name, ApiCase.params, ApiCase.body, ApiCase.expected)
                .where(ApiCase.api_id.in_(api_ids))
            )
        ).fetchall():
            cases_by_api.setdefault(row.api_id, []).append({
                "name": row.name,
                "params": row.params,
                "body": row.body,
                "expected": row.expected,
                # headers intentionally omitted — may contain auth tokens
            })

    api_entries = [
        {
            "id": r.id,
            "name": r.name,
            "method": r.method,
            "endpoint": r.endpoint,
            "description": r.description,
            "cases": cases_by_api.get(r.id, []),
        }
        for r in api_rows
    ]

    return {
        "title": node_name,
        "description": None,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "apis": api_entries,
    }


@router.post("/node/{node_id}/docs/generate")
async def generate_docs(
    node_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /node/{node_id}/docs/generate — walk the node subtree, render a doc snapshot, and upsert a PublishedDoc row.

    Steps:
        - Step 1: Column-pruned node load; verify editor access via resolve_workspace_access.
        - Step 2: Recursive CTE walk collects all descendant node IDs in one query.
        - Step 3: Column-pruned API + case fetch; build doc model JSON.
        - Step 4: Upsert PublishedDoc — update content if exists, insert if not; preserve public_token.
    """
    node_row = (
        await db.execute(select(Node.id, Node.workspace_id, Node.name).where(Node.id == node_id))
    ).first()
    if not node_row:
        return create_response(404, error_message="Node not found")

    access = await resolve_workspace_access(db, username, node_row.workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if not has_min_role(access, "editor"):
        return create_response(403, error_message="Access denied")

    node_ids = await _walk_subtree(db, node_id)
    content = await _build_doc_content(db, node_row.name, node_ids)

    existing = (
        await db.execute(select(PublishedDoc).where(PublishedDoc.node_id == node_id))
    ).scalar_one_or_none()

    if existing:
        existing.content = content
        existing.generated_by = username
        doc = existing
    else:
        doc = PublishedDoc(
            node_id=node_id,
            workspace_id=node_row.workspace_id,
            generated_by=username,
            public_token=None,
            content=content,
        )
        db.add(doc)

    await db.flush()
    await db.commit()

    api_count = len(content.get("apis", []))
    case_count = sum(len(a.get("cases", [])) for a in content.get("apis", []))

    return create_response(200, data={
        "doc_id": doc.id,
        "node_id": node_id,
        "api_count": api_count,
        "case_count": case_count,
        "generated_at": content["generated_at"],
        "is_published": doc.public_token is not None,
    }, schema=GenerateDocResponse)
