from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from config import (
    get_db,
    get_user_by_username,
    verify_node_ownership
)
from models import Node, Api, ApiCase, Workspace
from routers.workspace.list_workspace_tree import build_file_tree
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

        # Fetch the updated workspace and nodes
        result = await db.execute(
            select(Workspace)
            .options(selectinload(Workspace.nodes))
            .where(Workspace.id == node.workspace_id)
        )
        workspace = result.scalar_one_or_none()
        if not workspace:
            return create_response(206, error_message="Workspace not found after delete.")

        apis_dict = {}
        total_apis = 0
        total_test_cases = 0

        # Fetch all APIs with test cases for this workspace
        apis_result = await db.execute(
            select(Api)
            .join(Node, Api.file_id == Node.id)
            .options(selectinload(Api.cases))
            .where(
                and_(
                    Node.workspace_id == node.workspace_id,
                    Api.is_active == True
                )
            )
        )
        apis = apis_result.scalars().all()
        for api in apis:
            if api.file_id not in apis_dict:
                apis_dict[api.file_id] = []
            apis_dict[api.file_id].append(api)
            total_apis += 1
            total_test_cases += len(api.cases) if api.cases else 0

        # Build file tree
        file_tree = build_file_tree(workspace.nodes, True, apis_dict) if workspace.nodes else []

        data = {
            "id": workspace.id,
            "name": workspace.name,
            "description": workspace.description,
            "created_at": workspace.created_at,
            "file_tree": file_tree,
            "total_nodes": len(workspace.nodes) if workspace.nodes else 0,
            "include_apis": True,
            "total_apis": total_apis,
            "total_test_cases": total_test_cases
        }
        return create_response(200, data, message=message)

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)

