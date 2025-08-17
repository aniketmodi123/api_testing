from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import (
    get_db,
    get_user_by_username,
    verify_node_ownership
)
from models import Node
from utils import (
    ExceptionHandler,
    create_response
)

router = APIRouter()


@router.delete("/{node_id}")
async def delete_node(
    node_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Delete a node and all its children"""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify node ownership
        node = await verify_node_ownership(db, node_id, user.id)
        if not node:
            return create_response(206, error_message="Node not found or access denied")

        # Count children before deletion (for info)
        children_result = await db.execute(
            select(Node).where(Node.parent_id == node_id)
        )
        children_count = len(children_result.scalars().all())

        # Delete node (cascade will handle children)
        await db.delete(node)
        await db.commit()

        message = f"{node.type.title()} deleted successfully"
        if children_count > 0:
            message += f" (including {children_count} child items)"

        return create_response(200, {"message":message})

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)

