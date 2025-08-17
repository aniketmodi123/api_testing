from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from config import (
    get_db,
    get_user_by_username,
    validate_parent_node,
    verify_workspace_ownership
)
from models import Node
from schema import (
    NodeCreateRequest
)
from utils import (
    ExceptionHandler,
    create_response,
    value_correction
)

router = APIRouter()


@router.post("/create")
async def create_node(
    node_data: NodeCreateRequest,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Create a new folder or file node"""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify workspace ownership
        if not await verify_workspace_ownership(db, node_data.workspace_id, user.id):
            return create_response(403, error_message="Workspace access denied")

        # Validate parent node if provided
        if node_data.parent_id and not await validate_parent_node(db, node_data.parent_id, node_data.workspace_id):
            return create_response(400, error_message="Invalid parent node or parent is not a folder")

        # Check for duplicate names in the same parent
        existing_query = select(Node).where(
            and_(
                Node.workspace_id == node_data.workspace_id,
                Node.name == node_data.name,
                Node.parent_id == node_data.parent_id
            )
        )
        existing_result = await db.execute(existing_query)
        if existing_result.scalar_one_or_none():
            return create_response(400, error_message="A node with this name already exists in this location")

        # Create new node
        new_node = Node(
            workspace_id=node_data.workspace_id,
            name=node_data.name,
            type=node_data.type,
            parent_id=node_data.parent_id
        )

        db.add(new_node)
        await db.commit()
        await db.refresh(new_node)
        data = {
            "id": new_node.id,
            "workspace_id": new_node.workspace_id,
            "name": new_node.name,
            "type": new_node.type,
            "parent_id": new_node.parent_id,
            "created_at": str(new_node.created_at),
            "children": []
        }

        return create_response(201, value_correction(data))
    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)

