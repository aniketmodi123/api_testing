"""
What this file does: Exposes POST /file/{file_id}/api/save for creating or updating the API record attached to a file node.
"""

import json

from fastapi import APIRouter, Depends, Header
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import can_access_workspace, resolve_file_access, write_audit
from models import Api, ApiCase
from schema import ApiCreateRequest, ApiSaveResponse
from utils import ExceptionHandler, create_response

router = APIRouter()


@router.post("/file/{file_id}/api/save")
async def save_api(
    file_id: int,
    request: ApiCreateRequest,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """POST /file/{file_id}/api/save — upsert the API for a file node, merging extra_meta on update."""
    try:
        # Step 1: Resolve caller, file node, its existing API, and access in one query
        fa = await resolve_file_access(db, username, file_id)
        if fa.user is None:
            return create_response(401, error_message="User not found")
        if fa.node is None or not fa.can_access:
            return create_response(404, error_message="File not found or access denied")
        if fa.node.type != "file":
            return create_response(400, error_message="Can only create/update APIs in files, not folders")
        if not await can_access_workspace(db, fa.node.workspace_id, fa.user.id, min_role="editor"):
            return create_response(403, error_message="Editor access or higher required")

        file_node = fa.node
        existing_api = fa.api

        status_code = 200
        extra_meta = request.extra_meta or {}

        # Step 2: Upsert — update fields and merge extra_meta, or create fresh
        if existing_api:
            update_fields = request.model_dump(exclude_unset=True)
            update_fields.pop("extra_meta", None)

            for field, value in update_fields.items():
                setattr(existing_api, field, value)

            current_extra_meta = existing_api.extra_meta or {}
            if isinstance(current_extra_meta, str):
                current_extra_meta = json.loads(current_extra_meta)

            existing_api.extra_meta = {**current_extra_meta, **extra_meta}

            api = existing_api
            await write_audit(db, username=fa.user.username, action="api.update", entity_type="api", entity_id=api.id, workspace_id=file_node.workspace_id)
            await db.commit()
            await db.refresh(api)

            count = await db.execute(
                select(func.count()).select_from(ApiCase).where(ApiCase.api_id == api.id)
            )
            case_count = count.scalar()
            message = f"API '{api.name}' updated successfully"
        else:
            new_api = Api(
                file_id=file_id,
                name=request.name,
                method=request.method,
                endpoint=request.endpoint,
                description=request.description,
                is_active=request.is_active,
                extra_meta=extra_meta,
            )
            db.add(new_api)
            await db.flush()
            await write_audit(db, username=fa.user.username, action="api.create", entity_type="api", entity_id=new_api.id, workspace_id=file_node.workspace_id)
            await db.commit()
            await db.refresh(new_api)

            api = new_api
            case_count = 0
            status_code = 201
            message = f"API '{api.name}' created successfully"

        # Step 3: Split headers/body/params out of extra_meta for the response
        api_extra_meta = api.extra_meta or {}
        if isinstance(api_extra_meta, str):
            api_extra_meta = json.loads(api_extra_meta)

        data = {
            "id": api.id,
            "file_id": api.file_id,
            "name": api.name,
            "method": api.method,
            "endpoint": api.endpoint,
            "description": api.description,
            "is_active": api.is_active,
            "headers": api_extra_meta.get("headers", {}),
            "body": api_extra_meta.get("body", {}),
            "params": api_extra_meta.get("params", {}),
            "extra_meta": api.extra_meta,
            "created_at": api.created_at,
            "file_name": file_node.name,
            "workspace_id": file_node.workspace_id,
            "total_cases": case_count,
        }

        return create_response(status_code, data, ApiSaveResponse, message=message)

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
