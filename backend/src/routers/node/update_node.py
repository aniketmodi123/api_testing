"""
What this file does: Exposes PUT /node/{node_id} for renaming or reparenting a node within a workspace.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import (
    check_circular_reference,
    get_workspace_tree_response,
    has_min_role,
    resolve_node_access,
    validate_parent_node,
)
from models import Node
from schema import NodeUpdateRequest
from utils import ExceptionHandler, create_response, value_correction

router = APIRouter()


@router.put("/{node_id}")
async def update_node(
    node_id: int,
    node_data: NodeUpdateRequest,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """PUT /node/{node_id} — rename or reparent a node; reject circular references and duplicate names in the target location."""
    try:
        na = await resolve_node_access(db, username, node_id)
        if na.user is None:
            return create_response(400, error_message="User not found")
        if na.node is None:
            return create_response(404, error_message="Node not found")
        if not has_min_role(na, "editor"):
            return create_response(403, error_message="Access denied")

        node = na.node

        if node_data.parent_id is not None:
            if await check_circular_reference(db, node_id, node_data.parent_id):
                return create_response(400, error_message="Cannot move node: would create circular reference")
            if not await validate_parent_node(db, node_data.parent_id, node.workspace_id):
                return create_response(400, error_message="Invalid parent node or parent is not a folder")

        if node_data.name or node_data.parent_id is not None:
            new_name = node_data.name if node_data.name else node.name
            new_parent_id = node_data.parent_id if node_data.parent_id is not None else node.parent_id

            conflict = await db.execute(
                select(Node.id).where(
                    and_(
                        Node.workspace_id == node.workspace_id,
                        Node.name == new_name,
                        Node.parent_id == new_parent_id,
                        Node.id != node_id,
                    )
                )
            )
            if conflict.scalar_one_or_none():
                return create_response(400, error_message="A node with this name already exists in the target location")

        if node_data.name:
            node.name = node_data.name
        if node_data.parent_id is not None:
            node.parent_id = node_data.parent_id

        await db.commit()

        data, err = await get_workspace_tree_response(db, node.workspace_id, include_apis=True)
        if not data:
            return create_response(404, error_message=err or "Workspace not found after update.")
        message = f"{node.type.title()} renamed/updated successfully"
        return create_response(200, value_correction(data), message=message)

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
