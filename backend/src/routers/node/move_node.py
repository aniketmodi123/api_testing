from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from models import Node
from config import get_db
from schema import NodeCopyRequest
import logging

from utils import ExceptionHandler, create_response, get_unique_name, value_correction, get_workspace_tree_response
from routers.node.copy_node import copy_node_recursive

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/{node_id}/move")
async def move_node(
    node_id: int,
    request: NodeCopyRequest,  # reuse the copy request schema
    db: AsyncSession = Depends(get_db)
):
    """
    Move a node (file or folder) to a different location by copy-then-delete.
    Returns the full workspace tree structure (like list_workspace_tree).
    """
    try:
        # 1. Get the node to move
        result = await db.execute(select(Node).where(Node.id == node_id))
        source_node = result.scalar_one_or_none()
        if not source_node:
            return create_response(206, error_message="Node not found")

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
            return create_response(206, error_message=err or "Workspace not found after move.")
        message = f"{source_node.type.title()} moved successfully"
        return create_response(200, value_correction(data), message=message)

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)
