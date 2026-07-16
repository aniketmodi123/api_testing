"""
What this file does: Exposes GET /file/{file_id}/api for loading a file's API with optional test cases, and GET /workspace/{workspace_id}/bulk-testing-tree for bulk-test tree data.
"""

import json
from typing import Any

from fastapi import APIRouter, Depends, Header
from sqlalchemy import Row, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import (
    get_user_by_username,
    resolve_file_access,
    verify_workspace_ownership,
)
from models import Api, ApiCase, Node
from schema import (
    ApiDetailResponse,
    BulkTestingTreeResponse,
    BulkTreeNode,
    BulkTreeStats,
)
from utils import ExceptionHandler, create_response

router = APIRouter()


@router.get("/file/{file_id}/api")
async def get_file_api(
    file_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
    include_cases: bool = False
):
    """GET /file/{file_id}/api — return the API for a file node, optionally including all test cases sorted by name."""
    try:
        # Step 1: Resolve caller, file node, its API, and access in one query
        fa = await resolve_file_access(db, username, file_id)
        if fa.user is None:
            return create_response(401, error_message="User not found")
        if fa.node is None or not fa.can_access:
            return create_response(404, error_message="File not found or access denied")
        if fa.node.type != "file":
            return create_response(400, error_message="Can only get API from files, not folders")
        if fa.api is None:
            return create_response(404, error_message="No API found in this file")

        api = fa.api
        file_node = fa.node

        # Step 2: Merge API-level headers from extra_meta onto inherited headers
        inherited_headers = {}
        api_extra_headers = {}
        try:
            if getattr(api, "extra_meta", None):
                meta = api.extra_meta
                if isinstance(meta, str):
                    meta = json.loads(meta)
                if isinstance(meta, dict) and isinstance(meta.get("headers"), dict):
                    api_extra_headers = meta["headers"]
        except Exception:
            # Silently ignore malformed extra_meta
            api_extra_headers = {}

        final_headers = {**inherited_headers, **api_extra_headers}

        data = {
            "id": api.id,
            "file_id": api.file_id,
            "name": api.name,
            "method": api.method,
            "endpoint": api.endpoint,
            "headers": final_headers,
            "description": api.description,
            "is_active": api.is_active,
            "extra_meta": api.extra_meta,
            "created_at": api.created_at,
            "file_name": file_node.name,
            "workspace_id": file_node.workspace_id,
        }

        # Step 3: Load and embed cases, or just count them
        if include_cases:
            cases_result = await db.execute(
                select(
                    ApiCase.id,
                    ApiCase.name,
                    ApiCase.body,
                    ApiCase.params,
                    ApiCase.expected,
                    ApiCase.headers,
                    ApiCase.created_at,
                )
                .where(ApiCase.api_id == api.id)
                .order_by(func.lower(ApiCase.name))
            )
            data["test_cases"] = [dict(row) for row in cases_result.mappings()]
            data["total_cases"] = len(data["test_cases"])
        else:
            count = await db.execute(
                select(func.count()).select_from(ApiCase).where(ApiCase.api_id == api.id)
            )
            data["total_cases"] = count.scalar()

        return create_response(200, data, ApiDetailResponse)

    except Exception as e:
        return ExceptionHandler(e)


@router.get("/workspace/{workspace_id}/bulk-testing-tree")
async def get_bulk_testing_tree(
    workspace_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """GET /workspace/{workspace_id}/bulk-testing-tree — return the full node tree enriched with API method, endpoint, and test cases for bulk execution."""
    try:
        # Step 1: Resolve caller and verify workspace access
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(401, error_message="User not found")
        if not await verify_workspace_ownership(db, workspace_id, user.id):
            return create_response(404, error_message="Workspace not found or access denied")

        # Step 2: Bulk-load node columns, then API columns + case columns in three queries
        nodes_result = await db.execute(
            select(Node.id, Node.name, Node.type, Node.parent_id)
            .where(Node.workspace_id == workspace_id)
            .order_by(Node.parent_id.asc().nullsfirst(), Node.name.asc())
        )
        all_nodes = nodes_result.all()

        apis_result = await db.execute(
            select(Api.id, Api.file_id, Api.method, Api.endpoint, Api.description, Api.is_active)
            .join(Node, Api.file_id == Node.id)
            .where(
                (Node.workspace_id == workspace_id) &
                (Node.type == "file")
            )
        )
        all_apis = apis_result.all()
        apis_by_file = {api.file_id: api for api in all_apis}

        # coalesce matches the previous Python sort key (c.name or "").lower()
        cases_by_api: dict[int, list[Row]] = {}
        api_ids = [api.id for api in all_apis]
        if api_ids:
            cases_result = await db.execute(
                select(
                    ApiCase.api_id,
                    ApiCase.id,
                    ApiCase.name,
                    ApiCase.headers,
                    ApiCase.body,
                    ApiCase.params,
                    ApiCase.expected,
                    ApiCase.created_at,
                )
                .where(ApiCase.api_id.in_(api_ids))
                .order_by(func.lower(func.coalesce(ApiCase.name, "")), ApiCase.id)
            )
            for case in cases_result.all():
                cases_by_api.setdefault(case.api_id, []).append(case)

        # Step 3: Build per-node payloads, enriching file nodes with API + cases
        def build_tree_node(node: Row) -> dict[str, Any]:
            node_data: dict[str, Any] = {
                "id": node.id,
                "name": node.name,
                "type": node.type,
                "parent_id": node.parent_id,
                "children": [],
            }

            if node.type == "file" and node.id in apis_by_file:
                api = apis_by_file[node.id]
                node_data.update({
                    "method": api.method,
                    "endpoint": api.endpoint,
                    "description": api.description,
                    "is_active": api.is_active,
                    "test_cases": [
                        {
                            "id": case.id,
                            "name": case.name,
                            "method": api.method,
                            "endpoint": api.endpoint,
                            "headers": case.headers,
                            "body": case.body,
                            "params": case.params,
                            "expected": case.expected,
                            "created_at": case.created_at,
                        }
                        for case in cases_by_api.get(api.id, [])
                    ],
                })
                node_data["total_cases"] = len(node_data["test_cases"])

            return node_data

        nodes_by_id = {node.id: build_tree_node(node) for node in all_nodes}

        # Step 4: Wire children to parents and collect roots
        root_nodes = []
        for node in all_nodes:
            node_data = nodes_by_id[node.id]
            if node.parent_id is None:
                root_nodes.append(node_data)
            elif node.parent_id in nodes_by_id:
                nodes_by_id[node.parent_id]["children"].append(node_data)

        total_apis = len([n for n in nodes_by_id.values() if n["type"] == "file" and "method" in n])
        total_cases = sum(n.get("total_cases", 0) for n in nodes_by_id.values() if n["type"] == "file")

        response_data = {
            "tree": root_nodes,
            "stats": {
                "total_nodes": len(all_nodes),
                "total_apis": total_apis,
                "total_test_cases": total_cases,
            },
        }

        return create_response(200, response_data, BulkTestingTreeResponse)

    except Exception as e:
        return ExceptionHandler(e)
