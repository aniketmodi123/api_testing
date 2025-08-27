from typing import Optional
from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel

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
from models import Api


router = APIRouter()

class RunnerReq(BaseModel):
    file_id: int
    case_id: Optional[list[int]] = None

@router.get("/run")
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

        data = {
            "id": api.id,
            "file_id": api.file_id,
            "name": api.name,
            "method": api.method,
            "endpoint": api.endpoint,
            "headers":merge_result.get("merged_headers", {}),
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

            merged_headers = {**merge_result.get("merged_headers", {}), **case_headers}

            cases_data.append({
                "id": case.id,
                "name": case.name,
                "headers": merged_headers,  # Use combined headers
                "body": case.body,
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
