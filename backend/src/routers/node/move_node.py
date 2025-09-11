from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from models import Node, Workspace, Api
from config import get_db
from schema import NodeCopyRequest
import logging
from sqlalchemy.orm import selectinload
from sqlalchemy import and_

from utils import ExceptionHandler, create_response, get_unique_name
from routers.node.copy_node import copy_node_recursive
from routers.workspace.list_workspace_tree import build_file_tree

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/{node_id}/move")
async def move_node(
    node_id: int,
    request: NodeCopyRequest,  # reuse the copy request schema
    db: AsyncSession = Depends(get_db)
):
    """
    Move a node (file or folder) to a different location by copy-then-delete.
    Returns the full workspace tree structure (like list_workspace_tree).
    """
    try:
        # 1. Get the node to move
        result = await db.execute(select(Node).where(Node.id == node_id))
        source_node = result.scalar_one_or_none()
        if not source_node:
            return create_response(206, error_message="Node not found")

        # 2. Generate a unique name in the target location
        unique_name = await get_unique_name(
            request.new_name or source_node.name,
            request.target_workspace_id,
            request.target_folder_id,
            db
        )

        # 3. Copy the node (reuse your copy_node logic)
        copied_node = await copy_node_recursive(
            source_node,
            request.target_workspace_id,
            request.target_folder_id,
            unique_name,
            db
        )
        await db.commit()

        # 4. Delete the original node (and children if folder)
        await db.execute(delete(Node).where(Node.id == node_id))
        await db.commit()

        # 5. Fetch the updated workspace and nodes
        result = await db.execute(
            select(Workspace)
            .options(selectinload(Workspace.nodes))
            .where(Workspace.id == request.target_workspace_id)
        )
        workspace = result.scalar_one_or_none()
        if not workspace:
            return create_response(206, error_message="Workspace not found after move.")

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
                    Node.workspace_id == request.target_workspace_id,
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
        message = f"{source_node.type.title()} moved successfully"
        return create_response(200, data, message=message)

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)
