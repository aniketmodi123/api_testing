from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from models import Node, Workspace
from config import get_db
from schema import NodeMoveRequest
import logging

from utils import ExceptionHandler, create_response, value_correction

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

        logger.info(
            f"Node {node_id} ({old_name}) moved from workspace {old_workspace_id} "
            f"to workspace {request.target_workspace_id} with name '{request.new_name}'"
        )

        data = {
            "id": node.id,
            "name": request.new_name,
            "type": node.type,
            "workspace_id": request.target_workspace_id,
            "parent_id": request.target_folder_id,
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
