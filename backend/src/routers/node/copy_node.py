"""
What this file does: Exposes POST /node/{node_id}/copy for deep-copying a node tree to a target workspace/folder; also exports copy_node_recursive for use in move_node.
"""

from typing import Optional
import logging

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import (
    can_access_workspace,
    get_unique_name,
    get_workspace_tree_response,
    resolve_node_access,
)
from models import Api, ApiCase, Node
from schema import NodeCopyRequest
from utils import ExceptionHandler, create_response, value_correction

router = APIRouter()
logger = logging.getLogger(__name__)


async def copy_node_recursive(
    source_node: Node,
    target_workspace_id: int,
    target_parent_id: Optional[int],
    new_name: str,
    db: AsyncSession,
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
    copied_node = Node(
        name=new_name,
        type=source_node.type,
        workspace_id=target_workspace_id,
        parent_id=target_parent_id,
    )
    db.add(copied_node)
    await db.flush()

    if source_node.type == "file":
        api_result = await db.execute(
            select(
                Api.id,
                Api.name,
                Api.method,
                Api.endpoint,
                Api.description,
                Api.is_active,
                Api.extra_meta,
            ).where(Api.file_id == source_node.id)
        )
        source_api_row = api_result.one_or_none()

        if source_api_row is not None:
            copied_api = Api(
                file_id=copied_node.id,
                name=new_name,
                method=source_api_row.method,
                endpoint=source_api_row.endpoint,
                description=source_api_row.description,
                is_active=source_api_row.is_active,
                extra_meta=source_api_row.extra_meta,
            )
            db.add(copied_api)
            await db.flush()

            cases_result = await db.execute(
                select(
                    ApiCase.name,
                    ApiCase.params,
                    ApiCase.headers,
                    ApiCase.body,
                    ApiCase.expected,
                ).where(ApiCase.api_id == source_api_row.id)
            )
            for case_row in cases_result.all():
                db.add(
                    ApiCase(
                        api_id=copied_api.id,
                        name=case_row.name,
                        params=case_row.params,
                        headers=case_row.headers,
                        body=case_row.body,
                        expected=case_row.expected,
                    )
                )

    elif source_node.type == "folder":
        children_result = await db.execute(
            select(Node).where(Node.parent_id == source_node.id)
        )
        children = children_result.scalars().all()
        for child in children:
            await copy_node_recursive(child, target_workspace_id, copied_node.id, child.name, db)

    return copied_node


@router.post("/{node_id}/copy")
async def copy_node(
    node_id: int,
    request: NodeCopyRequest,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /node/{node_id}/copy — deep-copy a node to the target workspace/folder with a unique name; return updated workspace tree."""
    try:
        na = await resolve_node_access(db, username, node_id)
        if na.user is None:
            return create_response(401, error_message="User not found")
        if not na.can_access:
            return create_response(404, error_message="Node not found or access denied")

        # Verify write access to the target workspace
        if not await can_access_workspace(db, request.target_workspace_id, na.user.id, min_role="editor"):
            return create_response(403, error_message="Target workspace access denied")

        # Verify target folder exists if specified
        if request.target_folder_id:
            result = await db.execute(
                select(Node.id, Node.workspace_id).where(
                    Node.id == request.target_folder_id,
                    Node.type == "folder",
                )
            )
            target_folder_row = result.one_or_none()
            if not target_folder_row:
                return create_response(400, error_message="Invalid target folder")
            if target_folder_row.workspace_id != request.target_workspace_id:
                return create_response(400, error_message="Target folder must be in the target workspace")

        unique_name = await get_unique_name(
            request.new_name or na.node.name,
            request.target_workspace_id,
            request.target_folder_id,
            db,
        )

        await copy_node_recursive(
            na.node,
            request.target_workspace_id,
            request.target_folder_id,
            unique_name,
            db,
        )
        await db.commit()

        data, err = await get_workspace_tree_response(db, request.target_workspace_id, include_apis=True)
        if not data:
            return create_response(404, error_message=err or "Workspace not found after copy.")
        return create_response(200, value_correction(data))

    except Exception as e:
        logger.error("Error copying node %s: %s", node_id, e)
        await db.rollback()
        return ExceptionHandler(e)
