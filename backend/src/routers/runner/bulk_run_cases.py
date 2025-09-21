from datetime import datetime
from operator import and_
import asyncio
from typing import Union
from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from models import Api, Workspace, Node
from routers.runner.runner import run_from_list_api
from schema import BulkRunnerApi, BulkRunnerSelected
from utils import create_response, ExceptionHandler, value_correction, resolve_variables
from common_querys import get_user_by_username, get_workspace_variables, get_headers
from config import get_db

router = APIRouter()


async def verify_nodes(db: AsyncSession, node_id: list[int], user_id: int):
    result = await db.execute(
        select(Node)
        .join(Workspace, Node.workspace_id == Workspace.id)
        .where(and_(Node.id.in_(node_id), Workspace.user_id == user_id))
    )
    return result.scalars().all()


@router.post("/bulk_run_cases")
async def bulk_run_cases(
    req: Union[BulkRunnerApi, BulkRunnerSelected],
    username: str = Header(...),
    workspace_id: int = Header(...),
    db: AsyncSession = Depends(get_db),
):
    try:
        # ---- Verify User ----
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # ---- Collect File IDs ----
        file_ids, api_requests = [], {}
        if req.type == "api":
            file_ids = req.apis
            api_requests = {fid: None for fid in req.apis}
        elif req.type == "selected":
            file_ids = [api.file_id for api in req.apis]  # type: ignore
            api_requests = {api.file_id: api.cases for api in req.apis}  # type: ignore

        file_nodes = await verify_nodes(db, file_ids, user.id)
        if not file_nodes:
            return create_response(206, error_message="File not found or access denied")

        # ---- Batch Query APIs for all files ----
        query = select(Api).where(Api.file_id.in_(file_ids)).options(selectinload(Api.cases))
        apis = (await db.execute(query)).scalars().all()
        apis_by_file = {api.file_id: api for api in apis}

        # ---- Build Run Records ----
        record = {}
        for file in file_nodes:
            if file.type != "file":
                continue

            api = apis_by_file.get(file.id)
            if not api:
                continue

            folder_path, folder_ids, headers_map, merge_result = await get_headers(db, api.file_id)
            if not folder_path:
                continue

            workspace_variables = await get_workspace_variables(db, file.workspace_id)
            resolved_endpoint = resolve_variables(api.endpoint, workspace_variables)
            resolved_headers = merge_result.get("merged_headers", {})
            resolved_extra_meta = resolve_variables(api.extra_meta or {}, workspace_variables)

            cases_data = []
            selected_cases = api_requests.get(file.id)
            for case in api.cases:
                if selected_cases and case.id not in selected_cases:
                    continue

                merged_headers = {**resolved_headers, **(case.headers or {})}
                cases_data.append({
                    "id": case.id,
                    "name": case.name,
                    "headers": resolve_variables(merged_headers, workspace_variables),
                    "params": resolve_variables(case.params or {}, workspace_variables),
                    "body": resolve_variables(case.body, workspace_variables),
                    "expected": case.expected,
                    "created_at": case.created_at
                })

            if cases_data:
                record[file.id] = {
                    "id": api.id,
                    "file_id": api.file_id,
                    "name": api.name,
                    "method": api.method,
                    "endpoint": resolved_endpoint,
                    "headers": resolved_headers,
                    "description": api.description,
                    "is_active": api.is_active,
                    "extra_meta": resolved_extra_meta,
                    "test_cases": cases_data,
                    "total_cases": len(cases_data),
                }

        # ---- Run APIs concurrently ----
        async def run_api(file_id, data):
            return file_id, await run_from_list_api(data)

        results = await asyncio.gather(*[run_api(fid, data) for fid, data in record.items()])
        results_dict = {fid: result for fid, result in results}

        # ---- Fetch Workspace and Nodes ----
        result = await db.execute(
            select(Workspace).options(selectinload(Workspace.nodes)).where(Workspace.id == workspace_id)
        )
        workspace = result.scalar_one_or_none()
        if not workspace:
            return create_response(206, error_message="Workspace not found")

        node_dict = {
            node.id: {
                "id": node.id,
                "name": node.name,
                "type": node.type,
                "parent_id": node.parent_id,
                "created_at": node.created_at,
            }
            for node in workspace.nodes
        }

        # ---- Build Tree with Inline Pruning ----
        def build_tree(node_id: int):
            node = node_dict[node_id]
            children = [build_tree(cid) for cid in node_dict if node_dict[cid]["parent_id"] == node_id]
            children = [c for c in children if c]

            if node["type"] == "file":
                run_data = results_dict.get(node_id)
                if run_data:
                    return {"file_id": node_id, **run_data}
                return None
            else:
                if children:
                    return {**node, "children": children}
                return None

        root_nodes = [build_tree(nid) for nid, n in node_dict.items() if n["parent_id"] is None]
        root_nodes = [n for n in root_nodes if n]

        # ---- Response ----
        data = {
            "created_at": datetime.now(),
            "file_tree": root_nodes,
            "total_nodes": len(workspace.nodes) if workspace.nodes else 0,
        }
        return create_response(200, value_correction(data))

    except Exception as e:
        ExceptionHandler(e)
