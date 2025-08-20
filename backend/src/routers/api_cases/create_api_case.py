from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from config import (
    get_db,
    get_user_by_username,
    verify_node_ownership
)
from models import Api, ApiCase
from schema import ApiCaseCreateRequest
from utils import (
    ExceptionHandler,
    create_response,
    value_correction
)
from validator import validate_expected_spec

router = APIRouter()

@router.post("/file/{file_id}/api/cases")
async def create_test_case_for_file_api(
    file_id: int,
    request: ApiCaseCreateRequest,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Create test case for API in a specific file"""
    try:
        ok, errors = validate_expected_spec(request.expected)
        if not ok:
            # Shape errors only (not runtime); return 422 with reasons
            return create_response(422,error_message= f"Invalid expected schema, reasons: {errors}")
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify file ownership
        file_node = await verify_node_ownership(db, file_id, user.id)
        if not file_node:
            return create_response(206, error_message="File not found or access denied")

        if file_node.type != "file":
            return create_response(400, error_message="Can only create test cases for APIs in files, not folders")

        # Get API from file
        api_result = await db.execute(
            select(Api).where(Api.file_id == file_id)
        )
        api = api_result.scalar_one_or_none()

        if not api:
            return create_response(206, error_message="No API found in this file")

        # Check if test case with same name already exists for this API
        existing_case = await db.execute(
            select(ApiCase).where(
                and_(
                    ApiCase.api_id == api.id,
                    ApiCase.name == request.name
                )
            )
        )
        if existing_case.scalar_one_or_none():
            return create_response(400, error_message="Test case with this name already exists for this API")

        # Create new test case
        new_case = ApiCase(
            api_id=api.id,
            name=request.name,
            body=request.body,
            expected=request.expected
        )

        db.add(new_case)
        await db.commit()
        await db.refresh(new_case)

        data = {
            "id": new_case.id,
            "api_id": new_case.api_id,
            "name": new_case.name,
            "body": new_case.body,
            "expected": new_case.expected,
            "created_at": new_case.created_at,
            "api_name": api.name,
            "api_method": api.method,
            "api_endpoint": api.endpoint,
            "file_id": file_id,
            "file_name": file_node.name,
            "workspace_id": file_node.workspace_id
        }

        return create_response(201, value_correction(data))

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)
