from typing import Optional
from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel

from routers.runner.runner import run_from_list_api
from utils import (
    ExceptionHandler,
    create_response,
    resolve_variables
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from config import (
    get_db
)

from common_querys import verify_node_ownership, get_user_by_username, get_workspace_variables, get_headers
from models import Api


router = APIRouter()


class RunnerReq(BaseModel):
    file_id: int
    case_id: Optional[list[int]] = None


@router.post("/run")
async def get_file_api(
    req: RunnerReq,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        file_node = await verify_node_ownership(db, req.file_id, user.id)
        if not file_node:
            return create_response(206, error_message="File not found or access denied")

        if file_node.type != "file":
            return create_response(400, error_message="Can only get API from files, not folders")

        query = select(Api).where(Api.file_id == req.file_id).options(selectinload(Api.cases))
        result = await db.execute(query)
        api = result.scalar_one_or_none()
        if not api:
            return create_response(206, error_message="No API found in this file")

        folder_path, folder_ids, headers_map, merge_result = await get_headers(db, api.file_id)
        if not folder_path:
            return create_response(206, error_message="Folder not found")

        workspace_variables = await get_workspace_variables(db, file_node.workspace_id)

        resolved_endpoint = resolve_variables(api.endpoint, workspace_variables)
        resolved_headers = resolve_variables(merge_result.get("merged_headers", {}), workspace_variables)

        data = {
            "id": api.id,
            "file_id": api.file_id,
            "name": api.name,
            "method": api.method,
            "endpoint": resolved_endpoint,
            "headers": resolved_headers,
            "description": api.description,
            "is_active": api.is_active,
            "extra_meta": api.extra_meta,
        }

        cases_data = []
        for case in api.cases:
            if req.case_id and case.id not in req.case_id:
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

        results = await run_from_list_api(data)

        return results["flat"]

    except Exception as e:
        ExceptionHandler(e)
