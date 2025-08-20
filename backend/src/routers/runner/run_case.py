from fastapi import APIRouter, Depends, Header

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
from models import Api, ApiCase


router = APIRouter()


@router.get("/run")
async def get_file_api(
    file_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
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
        query = select(Api).where(Api.file_id == file_id).options(selectinload(Api.cases))

        result = await db.execute(query)
        api = result.scalar_one_or_none()

        if not api:
            return create_response(206, error_message="No API found in this file")

        # Get path from root to target folder
        folder_path, folder_ids, headers_map, merge_result = await get_headers(db, api.file_id)
        if not folder_path:
            return create_response(404, error_message="Folder not found")

        inherited_headers = merge_result.get("merged_headers", {})

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
            "version": api.version,
            "is_active": api.is_active,
            "extra_meta": api.extra_meta,
            "created_at": api.created_at,
            "file_name": file_node.name,
            "workspace_id": file_node.workspace_id
        }

        cases_data = []
        for case in api.cases:
            cases_data.append({
                "id": case.id,
                "name": case.name,
                "body": case.body,
                "expected": case.expected,
                "created_at": case.created_at
            })
        data["test_cases"] = cases_data
        data["total_cases"] = len(cases_data)

        results = await run_from_list_api(data, "http://192.168.100.170:8014")
        return results["flat"]
    except Exception as e:
        ExceptionHandler(e)
