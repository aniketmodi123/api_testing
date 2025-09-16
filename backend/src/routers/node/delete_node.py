from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import (
    get_db,
    get_user_by_username,
    verify_node_ownership
)
from models import Node, Api, ApiCase
from utils import (
    ExceptionHandler,
    create_response,
    value_correction,
    get_workspace_tree_response
)

router = APIRouter()


@router.delete("/{node_id}")
async def delete_node(
    node_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Delete a node and all its children, and return the updated workspace tree."""
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

        # If this is a file, check for associated APIs and delete them first
        api_count = 0
        case_count = 0
        if node.type == "file":
            # Get APIs associated with this file
            api_result = await db.execute(
                select(Api).where(Api.file_id == node_id)
            )
            api = api_result.scalar_one_or_none()

            # If an API exists, get its cases and delete them
            if api:
                # Count cases for information
                case_result = await db.execute(
                    select(ApiCase).where(ApiCase.api_id == api.id)
                )
                cases = case_result.scalars().all()
                case_count = len(cases)

                # Delete the API (cascade will handle the cases)
                await db.delete(api)
                api_count = 1

        # Now delete the node (cascade will handle children)
        await db.delete(node)
        await db.commit()

        message = f"{node.type.title()} deleted successfully"
        if children_count > 0:
            message += f" (including {children_count} child items)"
        if api_count > 0:
            message += f", {api_count} API"
            if case_count > 0:
                message += f" with {case_count} test cases"

        # Use shared workspace tree response function
        data, err = await get_workspace_tree_response(db, node.workspace_id, include_apis=True)
        if not data:
            return create_response(206, error_message=err or "Workspace not found after delete.")
        return create_response(200, value_correction(data), message=message)

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)

