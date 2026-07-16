"""
What this file does: Exposes the POST /node/create route for creating folder or file nodes within a workspace.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import (
    can_access_workspace,
    get_user_by_username,
    get_workspace_tree_response,
    validate_parent_node,
    write_audit,
)
from models import Node
from schema import NodeCreateRequest
from utils import ExceptionHandler, create_response, value_correction

router = APIRouter()


@router.post("/create")
async def create_node(
    node_data: NodeCreateRequest,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /node/create — create a folder or file node; reject duplicate names in the same parent, return updated workspace tree."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        if not await can_access_workspace(db, node_data.workspace_id, user.id, min_role="editor"):
            return create_response(403, error_message="Workspace access denied")

        if node_data.parent_id and not await validate_parent_node(db, node_data.parent_id, node_data.workspace_id):
            return create_response(400, error_message="Invalid parent node or parent is not a folder")

        # Check for duplicate names — select only id (cheapest check)
        conflict = await db.execute(
            select(Node.id).where(
                and_(
                    Node.workspace_id == node_data.workspace_id,
                    Node.name == node_data.name,
                    Node.parent_id == node_data.parent_id,
                )
            )
        )
        if conflict.scalar_one_or_none():
            return create_response(400, error_message="A node with this name already exists in this location")

        new_node = Node(
            workspace_id=node_data.workspace_id,
            name=node_data.name,
            type=node_data.type,
            parent_id=node_data.parent_id,
        )
        db.add(new_node)
        await write_audit(
            db,
            username=user.username,
            action="node.create",
            entity_type="node",
            workspace_id=node_data.workspace_id,
        )
        # expire_on_commit=False — Python-side defaults are populated; no refresh needed
        await db.commit()

        data, err = await get_workspace_tree_response(db, new_node.workspace_id, include_apis=True)
        if not data:
            return create_response(404, error_message=err or "Workspace not found after create.")
        message = f"{new_node.type.title()} created successfully"
        return create_response(201, value_correction(data), message=message)

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
