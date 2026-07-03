"""
What this file does: Exposes POST /node/{node_id}/move for moving a node to a new workspace/folder via copy-then-delete.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from models import Node
from config import get_db
from schema import NodeCopyRequest
import logging

from utils import ExceptionHandler, create_response, value_correction
from common_querys import get_workspace_tree_response, get_unique_name, get_user_by_username, can_access_workspace
from routers.node.copy_node import copy_node_recursive

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/{node_id}/move")
async def move_node(
    node_id: int,
    request: NodeCopyRequest,  # reuse the copy request schema
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """POST /node/{node_id}/move — copy the node to the target location with a unique name, then delete the original."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # 1. Get the node to move
        result = await db.execute(select(Node).where(Node.id == node_id))
        source_node = result.scalar_one_or_none()
        if not source_node:
            return create_response(404, error_message="Node not found")

        # Move deletes from the source workspace and writes into the target — require editor on both
        if not await can_access_workspace(db, source_node.workspace_id, user.id, min_role="editor"):
            return create_response(403, error_message="Source workspace access denied")
        if not await can_access_workspace(db, request.target_workspace_id, user.id, min_role="editor"):
            return create_response(403, error_message="Target workspace access denied")

        # 2. Generate a unique name in the target location
        unique_name = await get_unique_name(
            request.new_name or source_node.name,
            request.target_workspace_id,
            request.target_folder_id,
            db
        )

        # 3. Copy the node (reuse your copy_node logic)
        copied_node = await copy_node_recursive(
            source_node,
            request.target_workspace_id,
            request.target_folder_id,
            unique_name,
            db
        )
        await db.commit()

        # 4. Delete the original node (and children if folder)
        await db.execute(delete(Node).where(Node.id == node_id))
        await db.commit()

        # Use shared workspace tree response function
        data, err = await get_workspace_tree_response(db, request.target_workspace_id, include_apis=True)
        if not data:
            return create_response(404, error_message=err or "Workspace not found after move.")
        message = f"{source_node.type.title()} moved successfully"
        return create_response(200, value_correction(data), message=message)

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
