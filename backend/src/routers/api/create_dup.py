from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from typing import Optional

from config import (
    get_db,
    get_user_by_username,
    verify_node_ownership
)
from models import Node, Api, ApiCase
from utils import (
    ExceptionHandler,
    create_response,
    value_correction
)

router = APIRouter()

@router.post("/file/{file_id}/api/duplicate")
async def duplicate_file_api(
    file_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
    include_cases: bool = True,
    new_api_name: Optional[str] = None
):
    """Duplicate API into a new file created in the same folder"""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify source file ownership
        source_file = await verify_node_ownership(db, file_id, user.id)
        if not source_file:
            return create_response(206, error_message="Source file not found or access denied")

        if source_file.type != "file":
            return create_response(400, error_message="Source must be a file")

        # Get source API with cases
        query = select(Api).where(Api.file_id == file_id)
        if include_cases:
            query = query.options(selectinload(Api.cases))

        result = await db.execute(query)
        source_api = result.scalar_one_or_none()

        if not source_api:
            return create_response(206, error_message="No API found in source file")

        # Step 1: Create a new file in the same folder
        new_file_name = f"{source_file.name} (Copy)"
        new_file = Node(
            name=new_file_name,
            type="file",
            parent_id=source_file.parent_id,
            workspace_id=source_file.workspace_id
        )
        db.add(new_file)
        await db.flush()  # To get new_file.id

        # Step 2: Create duplicate API
        duplicate_name = new_api_name or f"{source_api.name} (Copy)"

        duplicate_api = Api(
            file_id=new_file.id,
            name=duplicate_name,
            method=source_api.method,
            endpoint=source_api.endpoint,
            description=source_api.description,
            version=source_api.version,
            is_active=source_api.is_active,
            extra_meta=source_api.extra_meta
        )

        db.add(duplicate_api)
        await db.flush()

        # Step 3: Duplicate cases if requested
        duplicated_cases = []
        if include_cases and hasattr(source_api, 'cases'):
            for case in source_api.cases:
                duplicate_case = ApiCase(
                    api_id=duplicate_api.id,
                    name=case.name,
                    request=case.request.copy() if case.request else {},
                    response=case.response.copy() if case.response else {}
                )
                db.add(duplicate_case)
                duplicated_cases.append(duplicate_case)
        await db.commit()
        await db.refresh(duplicate_api)
        await db.refresh(new_file)

        data = {
            "new_file_id": new_file.id,
            "new_file_name": new_file.name,
            "workspace_id": new_file.workspace_id,
            "api_id": duplicate_api.id,
            "api_name": duplicate_api.name,
            "duplicated_from_file_id": file_id,
            "duplicated_from_file_name": source_file.name,
            "duplicated_cases": len(duplicated_cases)
        }

        return create_response(201, value_correction(data))

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)
