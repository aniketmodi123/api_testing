from datetime import datetime
from operator import and_
import asyncio
from typing import Union
from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession
from config import get_db, get_user_by_username, get_headers
from models import Api, Workspace, Node
from routers.runner.runner import resolve_variables, run_from_list_api
from schema import BulkRunnerApi, BulkRunnerSelected
from utils import build_file_tree, create_response, ExceptionHandler, get_workspace_variables, value_correction
from sqlalchemy import select
from sqlalchemy.orm import selectinload

router = APIRouter()


async def verify_nodes(db: AsyncSession, node_id: list, user_id: int):
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
    db: AsyncSession = Depends(get_db)
):
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        file_ids = []
        api_requests = {}

        if req.type == "api":
            file_ids = req.apis
            for file_id in req.apis:
                api_requests[file_id] = None
        elif req.type == "selected":
            file_ids = [api.file_id for api in req.apis] # type: ignore
            for api in req.apis:
                api_requests[api.file_id] = getattr(api, "cases", None) # type: ignore

        file_node = await verify_nodes(db, file_ids, user.id)
        if not file_node:
            return create_response(206, error_message="File not found or access denied")

        record = {}
        for file in file_node:
            cases = api_requests.get(file.id, None)
            if file.type != "file":
                continue

            query = select(Api).where(Api.file_id == file.id).options(selectinload(Api.cases))
            result = await db.execute(query)
            api = result.scalar_one_or_none()
            if not api:
                return create_response(206, error_message="No API found in this file")

            folder_path, folder_ids, headers_map, merge_result = await get_headers(db, api.file_id)
            if not folder_path:
                return create_response(206, error_message="Folder not found")

            workspace_variables = await get_workspace_variables(db, file.workspace_id)

            resolved_endpoint = resolve_variables(api.endpoint, workspace_variables)
            resolved_headers = merge_result.get("merged_headers", {})
            resolved_extra_meta = resolve_variables(api.extra_meta or {}, workspace_variables)

            data = {
                "id": api.id,
                "file_id": api.file_id,
                "name": api.name,
                "method": api.method,
                "endpoint": resolved_endpoint,
                "headers": resolved_headers,
                "description": api.description,
                "is_active": api.is_active,
                "extra_meta": resolved_extra_meta,
            }

            cases_data = []
            for case in api.cases:
                if cases and case.id not in cases:
                    continue

                case_headers = case.headers or {}
                merged_headers = {**resolved_headers, **case_headers}

                resolved_case_headers = resolve_variables(merged_headers, workspace_variables)
                resolved_params = resolve_variables(case.params or {}, workspace_variables)
                resolved_body = resolve_variables(case.body, workspace_variables)

                cases_data.append({
                    "id": case.id,
                    "name": case.name,
                    "headers": resolved_case_headers,
                    "params": resolved_params,
                    "body": resolved_body,
                    "expected": case.expected,
                    "created_at": case.created_at
                })

            if not cases_data:
                return create_response(206, error_message="No test cases found")

            data["test_cases"] = cases_data
            data["total_cases"] = len(cases_data)
            record[file.id] = data

        async def run_api(file_id, data):
            result = await run_from_list_api(data)
            return file_id, result

        tasks = [run_api(file_id, data) for file_id, data in record.items()]
        results = await asyncio.gather(*tasks)
        results_dict = {file_id: result for file_id, result in results}


        result = await db.execute(
            select(Workspace)
            .options(selectinload(Workspace.nodes))
            .where(Workspace.id == workspace_id)
        )
        workspace = result.scalar_one_or_none()
        if not workspace:
            return None, "Workspace not found."

        apis_dict = {}

        node_dict = {node.id: {
            "id": node.id,
            "name": node.name,
            "type": node.type,
            "parent_id": node.parent_id,
            "created_at": node.created_at,
            "children": []
        } for node in workspace.nodes}


        root_nodes = []
        for node_data in node_dict.values():
            if node_data["parent_id"] is None:
                root_nodes.append(node_data)
            else:
                parent = node_dict.get(node_data["parent_id"])
                if parent:
                    if node_data["type"] == "file":
                        parent['children'].append({
                            'file_id': node_data["id"],
                            **results_dict.get(node_data["id"], {})
                        })
                    else:
                        parent["children"].append(node_data)

        data = {
            "created_at": datetime.now(),
            "file_tree": root_nodes,
            "total_nodes": len(workspace.nodes) if workspace.nodes else 0,
        }
        return create_response(200, value_correction(data))

    except Exception as e:
        ExceptionHandler(e)
