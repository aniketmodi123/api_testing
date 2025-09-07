from typing import Optional
from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
import re
import json

from runner import run_from_list_api
from utils import (
    ExceptionHandler,
    create_response
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from config import (
    get_db,
    get_headers,
    get_user_by_username,
    verify_node_ownership
)
from models import Api, Environment


router = APIRouter()


def resolve_variables_in_text(text: str, variables: dict) -> str:
    """Replace {{variable_name}} patterns with actual values"""
    if not text or not variables:
        return text

    def replace_variable(match):
        var_name = match.group(1)
        return str(variables.get(var_name, match.group(0)))  # Keep original if not found

    pattern = r'\{\{([a-zA-Z_][a-zA-Z0-9_\-]*)\}\}'
    return re.sub(pattern, replace_variable, str(text))


def resolve_variables_in_dict(data: dict, variables: dict) -> dict:
    """Recursively resolve variables in dictionary values"""
    if not data or not variables:
        return data

    resolved_data = {}
    for key, value in data.items():
        if isinstance(value, str):
            resolved_data[key] = resolve_variables_in_text(value, variables)
        elif isinstance(value, dict):
            resolved_data[key] = resolve_variables_in_dict(value, variables)
        elif isinstance(value, list):
            resolved_data[key] = resolve_variables_in_list(value, variables)
        else:
            resolved_data[key] = value
    return resolved_data


def resolve_variables_in_list(data: list, variables: dict) -> list:
    """Recursively resolve variables in list items"""
    if not data or not variables:
        return data

    resolved_data = []
    for item in data:
        if isinstance(item, str):
            resolved_data.append(resolve_variables_in_text(item, variables))
        elif isinstance(item, dict):
            resolved_data.append(resolve_variables_in_dict(item, variables))
        elif isinstance(item, list):
            resolved_data.append(resolve_variables_in_list(item, variables))
        else:
            resolved_data.append(item)
    return resolved_data


async def get_workspace_variables(db: AsyncSession, workspace_id: int) -> dict:
    """Get all enabled variables from the active environment in a workspace"""
    try:
        # Get active environment
        active_env_query = select(Environment).where(
            Environment.workspace_id == workspace_id,
            Environment.is_active == True
        )
        active_env_result = await db.execute(active_env_query)
        active_environment = active_env_result.scalar_one_or_none()

        if not active_environment or not active_environment.variables:
            return {}

        # Get all enabled variables with actual values (including secrets for execution)
        variables_dict = {}
        for key, var_data in active_environment.variables.items():
            if var_data is not None:
                variables_dict[key] = var_data

        return variables_dict
    except Exception as e:
        return {}


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
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify file ownership
        file_node = await verify_node_ownership(db, req.file_id, user.id)
        if not file_node:
            return create_response(206, error_message="File not found or access denied")

        if file_node.type != "file":
            return create_response(400, error_message="Can only get API from files, not folders")

        # Get API from file
        query = select(Api).where(Api.file_id == req.file_id).options(selectinload(Api.cases))

        result = await db.execute(query)
        api = result.scalar_one_or_none()

        if not api:
            return create_response(206, error_message="No API found in this file")

        # Get path from root to target folder
        folder_path, folder_ids, headers_map, merge_result = await get_headers(db, api.file_id)
        if not folder_path:
            return create_response(206, error_message="Folder not found")

        # Get workspace variables for variable resolution
        workspace_variables = await get_workspace_variables(db, file_node.workspace_id)

        # Resolve variables in API data
        resolved_endpoint = resolve_variables_in_text(api.endpoint, workspace_variables)
        resolved_headers = resolve_variables_in_dict(merge_result.get("merged_headers", {}), workspace_variables)

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
            if req.case_id:
                if case.id not in req.case_id:
                    continue
            # Combine inherited headers with case-specific headers (if any)
            try:
                case_headers = case.headers or {}
            except AttributeError:
                # Handle the case where headers column doesn't exist yet
                case_headers = {}

            merged_headers = {**resolved_headers, **case_headers}

            # Resolve variables in case data
            resolved_case_headers = resolve_variables_in_dict(merged_headers, workspace_variables)
            resolved_params = resolve_variables_in_dict(getattr(case, 'params', {}) or {}, workspace_variables)

            # Handle body - it could be string or dict
            case_body = case.body
            if isinstance(case_body, str):
                try:
                    # Try to parse as JSON first
                    parsed_body = json.loads(case_body)
                    resolved_body = resolve_variables_in_dict(parsed_body, workspace_variables)
                    resolved_body = json.dumps(resolved_body)
                except (json.JSONDecodeError, TypeError):
                    # If not JSON, treat as plain text
                    resolved_body = resolve_variables_in_text(case_body, workspace_variables)
            elif isinstance(case_body, dict):
                resolved_body = resolve_variables_in_dict(case_body, workspace_variables)
            else:
                resolved_body = case_body

            cases_data.append({
                "id": case.id,
                "name": case.name,
                "headers": resolved_case_headers,
                "params": resolved_params,
                "body": resolved_body,
                "expected": case.expected,
                "created_at": case.created_at
            })

        if len(cases_data) <= 0:
            return create_response(206, error_message="No test cases found")
        data["test_cases"] = cases_data
        data["total_cases"] = len(cases_data)


        results = await run_from_list_api(data)
        return results["flat"]
    except Exception as e:
        ExceptionHandler(e)
