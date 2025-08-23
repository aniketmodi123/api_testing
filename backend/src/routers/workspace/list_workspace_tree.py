from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from typing import List

from config import get_db, get_user_by_username
from models import Workspace, Node
from utils import (
    ExceptionHandler,
    create_response,
    value_correction
)

router = APIRouter()


# Helper function to build file tree
def build_file_tree(nodes: List[Node]) -> List[dict]:
    """Build hierarchical file tree from flat node list"""
    node_dict = {node.id: {
        "id": node.id,
        "name": node.name,
        "type": node.type,
        "parent_id": node.parent_id,
        "created_at": node.created_at,
        "children": []
    } for node in nodes}

    root_nodes = []
    for node_data in node_dict.values():
        if node_data["parent_id"] is None:
            root_nodes.append(node_data)
        else:
            parent = node_dict.get(node_data["parent_id"])
            if parent:
                parent["children"].append(node_data)

    return root_nodes


@router.get("/{workspace_id}")
async def get_workspace_with_tree(
    workspace_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Get workspace details with file tree structure"""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Get workspace with nodes
        result = await db.execute(
            select(Workspace)
            .options(selectinload(Workspace.nodes))
            .where(
                and_(
                    Workspace.id == workspace_id,
                    Workspace.user_id == user.id
                )
            )
        )
        workspace = result.scalar_one_or_none()

        if not workspace:
            return create_response(206, error_message="Workspace not found or access denied")

        # Build file tree
        file_tree = build_file_tree(workspace.nodes) if workspace.nodes else []

        data = {
            "id": workspace.id,
            "name": workspace.name,
            "description": workspace.description,
            "created_at": workspace.created_at,
            "file_tree": file_tree,
            "total_nodes": len(workspace.nodes) if workspace.nodes else 0
        }

        return create_response(200, value_correction(data))

    except Exception as e:
        ExceptionHandler(e)

