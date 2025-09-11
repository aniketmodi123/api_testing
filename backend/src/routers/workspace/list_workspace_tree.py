from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from typing import List, Optional

from config import get_db, get_user_by_username
from models import Workspace, Node, Api
from utils import (
    ExceptionHandler,
    create_response,
    value_correction
)

router = APIRouter()


# Helper function to build file tree with APIs and test cases
def build_file_tree(nodes: List[Node], include_apis: bool = False, apis_dict: Optional[dict] = None) -> List[dict]:
    """Build hierarchical file tree from flat node list, optionally including APIs and test cases"""
    node_dict = {node.id: {
        "id": node.id,
        "name": node.name,
        "type": node.type,
        "method": None,
        "parent_id": node.parent_id,
        "created_at": node.created_at,
        "children": []
    } for node in nodes}

    # Add APIs as children to their respective file nodes if requested
    if include_apis and apis_dict:
        for node_data in node_dict.values():
            if node_data["type"] == "file":
                file_apis = apis_dict.get(node_data["id"], [])
                for api in file_apis:
                    node_data["method"] = api.method
                    if api.cases:
                        for case in api.cases:
                            node_data["children"].append(
                                {
                                    "id": case.id,
                                    "name": case.name,
                                    "created_at": case.created_at.strftime("%Y-%m-%d %H:%M:%S")
                                }
                            )

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
    include_apis: bool = Query(False, description="Include APIs and test cases in the tree"),
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Get workspace details with file tree structure, optionally including APIs and test cases for bulk testing"""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")


        # Set all user's workspaces inactive, then set this one active
        await db.execute(
            select(Workspace)
            .where(Workspace.user_id == user.id)
            .execution_options(synchronize_session="fetch")
        )
        await db.execute(
            Workspace.__table__.update()
            .where(Workspace.user_id == user.id)
            .values(active=False)
        )
        await db.execute(
            Workspace.__table__.update()
            .where(Workspace.id == workspace_id)
            .values(active=True)
        )
        await db.commit()

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

        apis_dict = {}
        total_apis = 0
        total_test_cases = 0

        # If including APIs, fetch all APIs with test cases for this workspace
        if include_apis:
            apis_result = await db.execute(
                select(Api)
                .join(Node, Api.file_id == Node.id)
                .options(selectinload(Api.cases))
                .where(
                    and_(
                        Node.workspace_id == workspace_id,
                        Api.is_active == True
                    )
                )
            )
            apis = apis_result.scalars().all()

            # Group APIs by their file_id
            for api in apis:
                if api.file_id not in apis_dict:
                    apis_dict[api.file_id] = []
                apis_dict[api.file_id].append(api)
                total_apis += 1
                total_test_cases += len(api.cases) if api.cases else 0

        # Build file tree
        file_tree = build_file_tree(workspace.nodes, include_apis, apis_dict) if workspace.nodes else []

        data = {
            "id": workspace.id,
            "name": workspace.name,
            "description": workspace.description,
            "created_at": workspace.created_at,
            "file_tree": file_tree,
            "total_nodes": len(workspace.nodes) if workspace.nodes else 0,
            "include_apis": include_apis,
            "total_apis": total_apis,
            "total_test_cases": total_test_cases
        }

        return create_response(200, value_correction(data))

    except Exception as e:
        ExceptionHandler(e)

