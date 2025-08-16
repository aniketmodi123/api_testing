from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from config import (
    check_circular_reference,
    get_db,
    get_user_by_username,
    validate_parent_node,
    verify_node_ownership
)
from models import Node
from schema import (
    NodeUpdateRequest
)
from utils import (
    ExceptionHandler,
    create_response
)

router = APIRouter()

@router.put("/{node_id}")
async def update_node(
    node_id: int,
    node_data: NodeUpdateRequest,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Update/rename/move a node"""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify node ownership
        node = await verify_node_ownership(db, node_id, user.id)
        if not node:
            return create_response(404, error_message="Node not found or access denied")

        # If moving the node, validate the new parent
        if node_data.parent_id is not None:
            # Check for circular reference
            if await check_circular_reference(db, node_id, node_data.parent_id):
                return create_response(400, error_message="Cannot move node: would create circular reference")

            # Validate parent node
            if not await validate_parent_node(db, node_data.parent_id, node.workspace_id):
                return create_response(400, error_message="Invalid parent node or parent is not a folder")

        # Check for name conflicts if renaming or moving
        if node_data.name or node_data.parent_id is not None:
            new_name = node_data.name if node_data.name else node.name
            new_parent_id = node_data.parent_id if node_data.parent_id is not None else node.parent_id

            existing_query = select(Node).where(
                and_(
                    Node.workspace_id == node.workspace_id,
                    Node.name == new_name,
                    Node.parent_id == new_parent_id,
                    Node.id != node_id  # Exclude current node
                )
            )
            existing_result = await db.execute(existing_query)
            if existing_result.scalar_one_or_none():
                return create_response(400, error_message="A node with this name already exists in the target location")

        # Update node fields
        if node_data.name:
            node.name = node_data.name
        if node_data.parent_id is not None:
            node.parent_id = node_data.parent_id

        await db.commit()

        return create_response(200, {"message":"Node updated successfully"})

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)

