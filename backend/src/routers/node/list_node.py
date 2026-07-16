"""
What this file does: Exposes GET /node/{node_id} for retrieving a node's details, direct children, and breadcrumb path.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import get_node_path, resolve_node_access
from models import Node
from utils import ExceptionHandler, create_response, value_correction

router = APIRouter()


@router.get("/{node_id}")
async def get_node_with_children(
    node_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /node/{node_id} — return node metadata, direct children list, and ancestor breadcrumb path."""
    try:
        na = await resolve_node_access(db, username, node_id)
        if na.user is None:
            return create_response(400, error_message="User not found")
        if na.node is None:
            return create_response(404, error_message="Node not found")
        if not na.can_access:
            return create_response(403, error_message="Access denied")

        node = na.node

        # Fetch children with only needed columns — avoids full-model selectinload
        children_result = await db.execute(
            select(
                Node.id,
                Node.workspace_id,
                Node.name,
                Node.type,
                Node.parent_id,
                Node.created_at,
            ).where(Node.parent_id == node_id)
        )
        children = [dict(row) for row in children_result.mappings()]

        path = await get_node_path(db, node_id)

        data = {
            "id": node.id,
            "workspace_id": node.workspace_id,
            "name": node.name,
            "type": node.type,
            "parent_id": node.parent_id,
            "created_at": node.created_at,
            "path": path,
            "children": children,
            "children_count": len(children),
        }

        return create_response(200, value_correction(data))

    except Exception as e:
        return ExceptionHandler(e)
