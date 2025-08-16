from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from config import (
    get_db,
    get_node_path,
    get_user_by_username
)
from models import Workspace, Node
from utils import (
    ExceptionHandler,
    create_response,
    value_correction
)

router = APIRouter()

@router.get("/{node_id}")
async def get_node_with_children(
    node_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Get node details with its direct children and breadcrumb path"""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify node ownership and get node with children
        result = await db.execute(
            select(Node)
            .options(selectinload(Node.children))
            .join(Workspace, Node.workspace_id == Workspace.id)
            .where(
                and_(
                    Node.id == node_id,
                    Workspace.user_id == user.id
                )
            )
        )
        node = result.scalar_one_or_none()

        if not node:
            return create_response(404, error_message="Node not found or access denied")

        # Get breadcrumb path
        path = await get_node_path(db, node_id)

        # Prepare children data
        children = []
        if hasattr(node, 'children') and node.children:
            for child in node.children:
                children.append({
                    "id": child.id,
                    "workspace_id": child.workspace_id,
                    "name": child.name,
                    "type": child.type,
                    "parent_id": child.parent_id,
                    "created_at": child.created_at
                })

        data = {
            "id": node.id,
            "workspace_id": node.workspace_id,
            "name": node.name,
            "type": node.type,
            "parent_id": node.parent_id,
            "created_at": node.created_at,
            "path": path,
            "children": children,
            "children_count": len(children)
        }

        return create_response(200, value_correction(data))

    except Exception as e:
        ExceptionHandler(e)

