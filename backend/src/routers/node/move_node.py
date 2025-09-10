from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from models import Node, Workspace
from config import get_db
from schema import NodeMoveRequest, NodeCopyRequest
import logging

from utils import ExceptionHandler, create_response, get_unique_name, value_correction
from routers.node.copy_node import copy_node_recursive

router = APIRouter()
logger = logging.getLogger(__name__)

@router.put("/{node_id}/move")
async def move_node(
    node_id: int,
    request: NodeMoveRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Move a node (file or folder) to a different location
    """
    try:
        # Get the node to move
        result = await db.execute(select(Node).where(Node.id == node_id))
        node = result.scalar_one_or_none()
        if not node:
            return create_response(206, error_message="Node not found")

        # Verify target workspace exists
        result = await db.execute(select(Workspace).where(Workspace.id == request.target_workspace_id))
        target_workspace = result.scalar_one_or_none()
        if not target_workspace:
            return create_response(206, error_message="Target workspace not found")

        # Verify target folder exists if specified
        if request.target_folder_id:
            result = await db.execute(
                select(Node).where(
                    Node.id == request.target_folder_id,
                    Node.type == "folder"
                )
            )
            target_folder = result.scalar_one_or_none()
            if not target_folder:
                return create_response(206, error_message="Target folder not found")

            # Ensure target folder is in the target workspace
            if target_folder.workspace_id != request.target_workspace_id:
                return create_response(400, error_message="Target folder must be in the target workspace")

        # Check for name conflicts in target location
        result = await db.execute(
            select(Node).where(
                Node.workspace_id == request.target_workspace_id,
                Node.parent_id == request.target_folder_id,
                Node.name == request.new_name,
                Node.id != node_id  # Exclude the node being moved
            )
        )
        existing_node = result.scalar_one_or_none()

        if existing_node:
            return create_response(409, error_message=f"A {existing_node.type} with name '{request.new_name}' already exists in the target location")

        # Prevent moving a folder into itself or its descendants
        if node.type == "folder" and request.target_folder_id:
            current_parent = request.target_folder_id
            while current_parent:
                if current_parent == node.id:
                    return create_response(400, error_message="Cannot move a folder into itself or its descendants")
                result = await db.execute(select(Node).where(Node.id == current_parent))
                parent_node = result.scalar_one_or_none()
                current_parent = parent_node.parent_id if parent_node else None

        # Update the node
        old_name = node.name
        old_workspace_id = node.workspace_id
        old_parent_id = node.parent_id

        await db.execute(
            update(Node)
            .where(Node.id == node_id)
            .values(
                workspace_id=request.target_workspace_id,
                parent_id=request.target_folder_id,
                name=request.new_name
            )
        )

        await db.commit()

        # Re-fetch the node to get updated values
        result = await db.execute(select(Node).where(Node.id == node_id))
        updated_node = result.scalar_one_or_none()
        if not updated_node:
            return create_response(500, error_message="Node not found after update. Database may be inconsistent.")

        logger.info(
            f"Node {node_id} ({old_name}) moved from workspace {old_workspace_id} "
            f"to workspace {request.target_workspace_id} with name '{request.new_name}'"
        )

        data = {
            "id": updated_node.id,
            "name": updated_node.name,
            "type": updated_node.type,
            "workspace_id": updated_node.workspace_id,
            "parent_id": updated_node.parent_id,
            "old_location": {
                "workspace_id": old_workspace_id,
                "parent_id": old_parent_id,
                "name": old_name
            }
        }
        return create_response(200, value_correction(data))
    except Exception as e:
        logger.error(f"Error moving node {node_id}: {str(e)}")
        await db.rollback()
        ExceptionHandler(e)

@router.post("/{node_id}/move_simple")
async def move_node_simple(
    node_id: int,
    request: NodeCopyRequest,  # reuse the copy request schema
    db: AsyncSession = Depends(get_db)
):
    """
    Move a node (file or folder) to a different location by copy-then-delete.
    This approach copies the node and its data, then deletes the original.
    Handles name conflicts by appending 'copy', 'copy 2', etc.
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

        # 5. Return the new node info
        return create_response(200, value_correction({
            "id": copied_node.id,
            "name": copied_node.name,
            "type": copied_node.type,
            "workspace_id": copied_node.workspace_id,
            "parent_id": copied_node.parent_id,
            "moved_from": node_id
        }))
    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)
