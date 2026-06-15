"""
What this file does: Exposes DELETE /node/{node_id} for recursively deleting a node and all its children, APIs, and test cases.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import get_user_by_username, verify_node_ownership,get_workspace_tree_response
from models import Node, Api, ApiCase
from utils import (
    ExceptionHandler,
    create_response,
    value_correction
)

router = APIRouter()


@router.delete("/{node_id}")
async def delete_node(
    node_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """DELETE /node/{node_id} — recursively delete a node plus all child nodes, associated APIs, and test cases; return updated workspace tree."""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify node ownership
        node = await verify_node_ownership(db, node_id, user.id)
        if not node:
            return create_response(206, error_message="Node not found or access denied")


        # Recursive delete function
        async def recursive_delete_node(node_obj):
            # Delete all child nodes first
            children_result = await db.execute(select(Node).where(Node.parent_id == node_obj.id))
            children = children_result.scalars().all()
            for child in children:
                await recursive_delete_node(child)

            # If this is a file, delete associated APIs and cases
            api_count = 0
            case_count = 0
            if node_obj.type == "file":
                api_result = await db.execute(select(Api).where(Api.file_id == node_obj.id))
                api = api_result.scalar_one_or_none()
                if api:
                    case_result = await db.execute(select(ApiCase).where(ApiCase.api_id == api.id))
                    cases = case_result.scalars().all()
                    case_count = len(cases)
                    # Delete all cases explicitly
                    for case in cases:
                        await db.delete(case)
                    await db.delete(api)
                    api_count = 1
            await db.delete(node_obj)
            return len(children), api_count, case_count

        # Start recursive deletion
        children_count, api_count, case_count = await recursive_delete_node(node)
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

