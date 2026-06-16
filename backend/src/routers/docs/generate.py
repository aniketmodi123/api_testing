"""
What this file does: Generates a documentation snapshot for a node and its subtree; upserts a PublishedDoc row with the rendered API + case model.
"""
from collections import deque
from datetime import datetime
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from common_querys import can_access_workspace, get_user_by_username
from config import get_db
from models import Api, ApiCase, Node, PublishedDoc
from utils import ExceptionHandler, create_response

router = APIRouter()


async def _walk_subtree(db: AsyncSession, root_node_id: int) -> List[int]:
    """What it does: Return IDs of root node and all descendant nodes via BFS."""
    visited = []
    queue = deque([root_node_id])
    while queue:
        nid = queue.popleft()
        visited.append(nid)
        children = (
            await db.execute(select(Node.id).where(Node.parent_id == nid))
        ).scalars().all()
        queue.extend(children)
    return visited


async def _build_doc_content(db: AsyncSession, node: Node, node_ids: List[int]) -> Dict[str, Any]:
    """What it does: Build the doc model JSON from all APIs and cases within the given node IDs."""
    apis_result = (
        await db.execute(
            select(Api)
            .where(Api.file_id.in_(node_ids), Api.is_active == True)
            .options(selectinload(Api.cases))
            .order_by(Api.id)
        )
    ).scalars().all()

    api_entries = []
    for api in apis_result:
        cases = []
        for case in (api.cases or []):
            cases.append({
                "name": case.name,
                "params": case.params,
                "body": case.body,
                "expected": case.expected,
                # headers intentionally omitted — may contain auth tokens
            })
        api_entries.append({
            "id": api.id,
            "name": api.name,
            "method": api.method,
            "endpoint": api.endpoint,
            "description": api.description,
            "cases": cases,
        })

    return {
        "title": node.name,
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
        - Step 1: Authenticate user; load node; verify editor access on its workspace.
        - Step 2: BFS-walk the subtree to collect all descendant node IDs.
        - Step 3: Load all active APIs + cases in the subtree; build doc model JSON.
        - Step 4: Upsert PublishedDoc — update content if exists, insert if not; preserve public_token.
    """
    try:
        # Step 1: auth + node check
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        node = (await db.execute(select(Node).where(Node.id == node_id))).scalar_one_or_none()
        if not node:
            return create_response(206, error_message="Node not found")

        access = await can_access_workspace(db, node.workspace_id, user.id, min_role="editor")
        if not access:
            return create_response(403, error_message="Access denied")

        # Step 2: walk subtree
        node_ids = await _walk_subtree(db, node_id)

        # Step 3: build doc
        content = await _build_doc_content(db, node, node_ids)

        # Step 4: upsert
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
                workspace_id=node.workspace_id,
                generated_by=username,
                public_token=None,
                content=content,
            )
            db.add(doc)

        await db.commit()
        await db.refresh(doc)

        api_count = len(content.get("apis", []))
        case_count = sum(len(a.get("cases", [])) for a in content.get("apis", []))

        return create_response(200, data={
            "doc_id": doc.id,
            "node_id": node_id,
            "api_count": api_count,
            "case_count": case_count,
            "generated_at": content["generated_at"],
            "is_published": doc.public_token is not None,
        })
    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
