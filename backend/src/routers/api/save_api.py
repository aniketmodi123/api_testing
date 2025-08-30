from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import (
    get_db,
    get_user_by_username,
    verify_node_ownership
)
from models import Api, ApiCase
from schema import ApiCreateRequest
from utils import (
    ExceptionHandler,
    create_response,
    value_correction
)

router = APIRouter()


@router.post("/file/{file_id}/api/save")
async def save_api(
    file_id: int,
    request: ApiCreateRequest,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Create or update API in a file"""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify file ownership and that it's actually a file
        file_node = await verify_node_ownership(db, file_id, user.id)
        if not file_node:
            return create_response(206, error_message="File not found or access denied")

        if file_node.type != "file":
            return create_response(400, error_message="Can only create/update APIs in files, not folders")

        # Check if API already exists in this file
        result = await db.execute(
            select(Api).where(Api.file_id == file_id)
        )
        existing_api = result.scalar_one_or_none()

        # Prepare response status code
        status_code = 200

        # Prepare the extra_meta field to store API data
        extra_meta = request.extra_meta or {}

        if existing_api:
            # Update existing API
            update_fields = request.model_dump(exclude_unset=True)

            # Don't directly update extra_meta from the dump, we'll handle it separately
            if 'extra_meta' in update_fields:
                del update_fields['extra_meta']

            for field, value in update_fields.items():
                setattr(existing_api, field, value)

            # Update or keep existing extra_meta data
            current_extra_meta = existing_api.extra_meta or {}
            if isinstance(current_extra_meta, str):
                import json
                current_extra_meta = json.loads(current_extra_meta)

            # Merge the existing extra_meta with the new one
            merged_extra_meta = {**current_extra_meta, **extra_meta}
            existing_api.extra_meta = merged_extra_meta

            api = existing_api
            await db.commit()
            await db.refresh(api)

            # Get case count for updated API
            case_count_result = await db.execute(
                select(ApiCase.id).where(ApiCase.api_id == api.id)
            )
            case_count = len(case_count_result.fetchall())

            message = f"API '{api.name}' updated successfully"
        else:
            # Create new API
            new_api = Api(
                file_id=file_id,
                name=request.name,
                method=request.method,
                endpoint=request.endpoint,
                description=request.description,
                is_active=request.is_active,
                extra_meta=extra_meta
            )

            db.add(new_api)
            await db.commit()
            await db.refresh(new_api)

            api = new_api
            case_count = 0
            status_code = 201
            message = f"API '{api.name}' created successfully"

        # Extract API data from extra_meta for the response
        api_extra_meta = api.extra_meta or {}
        if isinstance(api_extra_meta, str):
            import json
            api_extra_meta = json.loads(api_extra_meta)

        headers = api_extra_meta.get('headers', {})
        body = api_extra_meta.get('body', {})
        params = api_extra_meta.get('params', {})

        # Prepare response data
        data = {
            "id": api.id,
            "file_id": api.file_id,
            "name": api.name,
            "method": api.method,
            "endpoint": api.endpoint,
            "description": api.description,
            "is_active": api.is_active,
            "headers": headers,
            "body": body,
            "params": params,
            "extra_meta": api.extra_meta,
            "created_at": api.created_at,
            "file_name": file_node.name,
            "workspace_id": file_node.workspace_id,
            "total_cases": case_count,
            "message": message
        }

        return create_response(status_code, value_correction(data))

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)
