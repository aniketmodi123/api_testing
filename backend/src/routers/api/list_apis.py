from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from config import (
    get_db,
    get_user_by_username,
    verify_node_ownership
)
from models import Api, ApiCase, Node
from utils import (
    ExceptionHandler,
    create_response,
    value_correction
)

router = APIRouter()


@router.get("/file/{file_id}/api")
async def get_file_api(
    file_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
    include_cases: bool = False
):
    """Get API from a file with optional test cases"""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify file ownership
        file_node = await verify_node_ownership(db, file_id, user.id)
        if not file_node:
            return create_response(206, error_message="File not found or access denied")

        if file_node.type != "file":
            return create_response(400, error_message="Can only get API from files, not folders")

        # Get API from file
        query = select(Api).where(Api.file_id == file_id)

        if include_cases:
            query = query.options(selectinload(Api.cases))

        result = await db.execute(query)
        api = result.scalar_one_or_none()

        if not api:
            return create_response(206, error_message="No API found in this file")

        # # Get path from root to target folder
        # folder_path, folder_ids, headers_map, merge_result = await get_headers(db, api.file_id)
        # if not folder_path:
        #     return create_response(206, error_message="Folder not found")

        # inherited_headers = merge_result.get("merged_headers", {})
        inherited_headers = {}

        # 5) Optional API-level headers override (from api.extra_meta.headers)
        api_extra_headers = {}
        try:
            if getattr(api, "extra_meta", None):
                meta = api.extra_meta
                # if stored as JSON string, parse
                if isinstance(meta, str):
                    import json
                    meta = json.loads(meta)
                if isinstance(meta, dict) and isinstance(meta.get("headers"), dict):
                    api_extra_headers = meta["headers"]
        except Exception:
            # Silently ignore malformed extra_meta; you can log if needed
            api_extra_headers = {}

        final_headers = {**inherited_headers, **api_extra_headers}

        data = {
            "id": api.id,
            "file_id": api.file_id,
            "name": api.name,
            "method": api.method,
            "endpoint": api.endpoint,
            "headers":final_headers,
            "description": api.description,
            "is_active": api.is_active,
            "extra_meta": api.extra_meta,
            "created_at": api.created_at,
            "file_name": file_node.name,
            "workspace_id": file_node.workspace_id
        }

        if include_cases and hasattr(api, 'cases'):
            cases_data = []
            for case in api.cases:
                cases_data.append({
                    "id": case.id,
                    "name": case.name,
                    "body": case.body,
                    "params": getattr(case, 'params', None),
                    "expected": case.expected,
                    "headers": case.headers,
                    "created_at": case.created_at
                })
            data["test_cases"] = cases_data
            data["total_cases"] = len(cases_data)
        else:
            # Get case count without loading full cases
            case_count_result = await db.execute(
                select(ApiCase.id).where(ApiCase.api_id == api.id)
            )
            data["total_cases"] = len(case_count_result.fetchall())

        return create_response(200, value_correction(data))

    except Exception as e:
        ExceptionHandler(e)


@router.get("/workspace/{workspace_id}/bulk-testing-tree")
async def get_bulk_testing_tree(
    workspace_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Get optimized tree structure for bulk testing with all APIs and test cases"""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Get all nodes in workspace with their APIs and test cases
        nodes_query = select(Node).where(
            (Node.workspace_id == workspace_id) &
            (Node.user_id == user.id)
        ).order_by(Node.parent_id.asc().nullsfirst(), Node.name.asc())

        nodes_result = await db.execute(nodes_query)
        all_nodes = nodes_result.scalars().all()

        # Get all APIs with test cases for this workspace
        apis_query = select(Api).options(selectinload(Api.cases)).join(Node).where(
            (Node.workspace_id == workspace_id) &
            (Node.user_id == user.id) &
            (Node.type == "file")
        )

        apis_result = await db.execute(apis_query)
        all_apis = apis_result.scalars().all()

        # Create API lookup by file_id
        apis_by_file = {}
        for api in all_apis:
            apis_by_file[api.file_id] = api

        # Build tree structure
        def build_tree_node(node, apis_by_file):
            node_data = {
                "id": node.id,
                "name": node.name,
                "type": node.type,
                "parent_id": node.parent_id,
                "children": []
            }

            # If this is a file node with an API, add API and test cases data
            if node.type == "file" and node.id in apis_by_file:
                api = apis_by_file[node.id]
                node_data.update({
                    "method": api.method,
                    "endpoint": api.endpoint,
                    "description": api.description,
                    "is_active": api.is_active,
                    "test_cases": []
                })

                # Add test cases
                if hasattr(api, 'cases') and api.cases:
                    for case in api.cases:
                        node_data["test_cases"].append({
                            "id": case.id,
                            "name": case.name,
                            "method": api.method,  # Inherit from API
                            "endpoint": api.endpoint,  # Inherit from API
                            "headers": case.headers,
                            "body": case.body,
                            "params": getattr(case, 'params', None),
                            "expected": case.expected,
                            "created_at": case.created_at
                        })

                node_data["total_cases"] = len(node_data["test_cases"])

            return node_data

        # Build nodes lookup
        nodes_by_id = {node.id: build_tree_node(node, apis_by_file) for node in all_nodes}

        # Build tree structure
        root_nodes = []
        for node in all_nodes:
            node_data = nodes_by_id[node.id]
            if node.parent_id is None:
                root_nodes.append(node_data)
            else:
                if node.parent_id in nodes_by_id:
                    nodes_by_id[node.parent_id]["children"].append(node_data)

        # Calculate statistics
        total_apis = len([n for n in nodes_by_id.values() if n["type"] == "file" and "method" in n])
        total_cases = sum(n.get("total_cases", 0) for n in nodes_by_id.values() if n["type"] == "file")

        response_data = {
            "tree": root_nodes,
            "stats": {
                "total_nodes": len(all_nodes),
                "total_apis": total_apis,
                "total_test_cases": total_cases
            }
        }

        return create_response(200, value_correction(response_data))

    except Exception as e:
        ExceptionHandler(e)

