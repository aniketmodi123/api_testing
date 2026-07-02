"""
What this file does: Exposes POST /run for executing all (or selected) test cases for a file's API with resolved variables and inherited folder headers.
"""

from typing import Optional
from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel

from routers.runner.runner import run_from_list_api
from schema import CaseRunResult
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

from common_querys import resolve_file_access, get_headers, resolve_auth, build_scope_chain
from auth_strategies import apply_auth
from models import Api


router = APIRouter()


class RunnerReq(BaseModel):
    """Request body for POST /run.
    Attributes:
        file_id: ID of the file node whose API to run.
        case_id: Optional list of ApiCase IDs to run; None runs all cases for the API.
    """
    file_id: int
    case_id: Optional[list[int]] = None


@router.post("/run")
async def get_file_api(
    req: RunnerReq,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """POST /run — resolve workspace variables and folder headers, then execute the specified (or all) test cases for a file's API."""
    try:
        access = await resolve_file_access(db, username, req.file_id)
        if not access.user:
            return create_response(400, error_message="User not found")
        if not access.node:
            return create_response(404, error_message="File not found")
        if not access.can_access:
            return create_response(403, error_message="Access denied")

        file_node = access.node

        if file_node.type != "file":
            return create_response(400, error_message="Can only get API from files, not folders")

        query = select(Api).where(Api.file_id == req.file_id).options(selectinload(Api.cases))
        result = await db.execute(query)
        api = result.scalar_one_or_none()
        if not api:
            return create_response(404, error_message="No API found in this file")

        folder_path, folder_ids, headers_map, merge_result = await get_headers(db, api.file_id)
        if not folder_path:
            return create_response(404, error_message="Folder not found")

        workspace_variables = await build_scope_chain(db, file_id=req.file_id, username=username, workspace_id=file_node.workspace_id)

        resolved_endpoint = resolve_variables(api.endpoint, workspace_variables)
        resolved_headers = resolve_variables(merge_result.get("merged_headers", {}), workspace_variables)

        # Inject per-API auth into API-level headers so every case inherits it.
        auth_config = await resolve_auth(db, api.file_id)
        if auth_config:
            auth_headers, _ = apply_auth(
                auth_config,
                method=api.method.upper(),
                url=resolved_endpoint,
                existing_headers=resolved_headers,
            )
            for k, v in auth_headers.items():
                if k not in resolved_headers:
                    resolved_headers[k] = v

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
            return create_response(404, error_message="No test cases found")

        data["test_cases"] = cases_data
        data["total_cases"] = len(cases_data)

        results = await run_from_list_api(data)

        return create_response(200, data=results["flat"], schema=CaseRunResult)

    except Exception as e:
        return ExceptionHandler(e)
