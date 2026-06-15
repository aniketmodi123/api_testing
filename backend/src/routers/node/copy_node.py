"""
What this file does: Exposes POST /node/{node_id}/copy for deep-copying a node tree to a target workspace/folder; also exports copy_node_recursive for use in move_node.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from models import Node, Workspace, Api, ApiCase
from config import get_db
from schema import NodeCopyRequest
from typing import Optional
import logging

from utils import ExceptionHandler, create_response, value_correction
from common_querys import get_workspace_tree_response, get_unique_name

router = APIRouter()
logger = logging.getLogger(__name__)

async def copy_node_recursive(
    source_node: Node,
    target_workspace_id: int,
    target_parent_id: Optional[int],
    new_name: str,
    db: AsyncSession
) -> Node:
    """
    What it does: Deep-copy a node into a target workspace/folder, duplicating its API and test cases for file nodes and recursing into children for folder nodes.
    Args:
        source_node: The Node to copy.
        target_workspace_id: Workspace that will own the copy.
        target_parent_id: Parent folder id in the target workspace; None places the copy at the root.
        new_name: Name to assign to the copied root node.
    Returns:
        Node: The newly created root copy with its DB id populated via flush.
    Steps:
        - Step 1: Create a new Node with new_name, target_workspace_id, and target_parent_id; flush to obtain its id
        - Step 2: If source is a file — copy the associated Api record and all its ApiCase children under the new node
        - Step 3: If source is a folder — fetch all direct children and recursively copy each into the new folder
    """
    # Create the copied node
    copied_node = Node(
        name=new_name,
        type=source_node.type,
        workspace_id=target_workspace_id,
        parent_id=target_parent_id
    )

    db.add(copied_node)
    await db.flush()  # Get the ID without committing

    # If it's a file node, copy associated API data and test cases
    if source_node.type == "file":
        # Copy API data if exists
        result = await db.execute(
            select(Api).options(selectinload(Api.cases)).where(Api.file_id == source_node.id)
        )
        source_api = result.scalar_one_or_none()

        if source_api:
            copied_api = Api(
                file_id=copied_node.id,
                name=new_name,
                method=source_api.method,
                endpoint=source_api.endpoint,
                description=source_api.description,
                is_active=source_api.is_active,
                extra_meta=source_api.extra_meta,
                created_at=source_api.created_at,
            )
            db.add(copied_api)
            await db.flush()

            # Copy test cases
            for source_case in source_api.cases:
                copied_test_case = ApiCase(
                    api_id=copied_api.id,
                    name=source_case.name,
                    params=source_case.params,
                    headers=source_case.headers,
                    body=source_case.body,
                    expected=source_case.expected,
                    created_at=source_case.created_at,
                )
                db.add(copied_test_case)

    # If it's a folder, recursively copy all children
    elif source_node.type == "folder":
        result = await db.execute(select(Node).where(Node.parent_id == source_node.id))
        children = result.scalars().all()

        for child in children:
            await copy_node_recursive(
                child,
                target_workspace_id,
                copied_node.id,
                child.name,
                db
            )

    return copied_node

@router.post("/{node_id}/copy")
async def copy_node(
    node_id: int,
    request: NodeCopyRequest,
    db: AsyncSession = Depends(get_db)
):
    """POST /node/{node_id}/copy — deep-copy a node to the target workspace/folder with a unique name; return updated workspace tree."""
    try:
        # Get the node to copy
        result = await db.execute(select(Node).where(Node.id == node_id))
        source_node = result.scalar_one_or_none()
        if not source_node:
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

        # Generate a unique name in the target location
        unique_name = await get_unique_name(
            request.new_name or source_node.name,
            request.target_workspace_id,
            request.target_folder_id,
            db
        )

        # Perform the copy operation
        copied_node = await copy_node_recursive(
            source_node,
            request.target_workspace_id,
            request.target_folder_id,
            unique_name,
            db
        )

        await db.commit()


        # Use shared workspace tree response function
        data, err = await get_workspace_tree_response(db, request.target_workspace_id, include_apis=True)
        if not data:
            return create_response(206, error_message=err or "Workspace not found after copy.")
        return create_response(200, value_correction(data))

    except Exception as e:
        logger.error(f"Error copying node {node_id}: {str(e)}")
        await db.rollback()
        ExceptionHandler(e)
