from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from config import (
    get_db,
    get_user_by_username
)
from models import Workspace, Node, Api, ApiCase
from schema import UpdateTestCaseRequest
from utils import (
    ExceptionHandler,
    create_response,
    value_correction
)
from validator import validate_expected_spec

router = APIRouter()


@router.put("/case/{case_id}")
async def update_test_case(
    case_id: int,
    request: UpdateTestCaseRequest,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Update test case details"""
    try:
        ok, errors = validate_expected_spec(request.expected)
        if not ok:
            # Shape errors only (not runtime); return 422 with reasons
            return create_response(422,error_message= f"Invalid expected schema, reasons: {errors}")
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify test case ownership through API -> file -> workspace -> user
        result = await db.execute(
            select(ApiCase)
            .join(Api, ApiCase.api_id == Api.id)
            .join(Node, Api.file_id == Node.id)
            .join(Workspace, Node.workspace_id == Workspace.id)
            .where(
                and_(
                    ApiCase.id == case_id,
                    Workspace.user_id == user.id
                )
            )
        )
        case = result.scalar_one_or_none()

        if not case:
            return create_response(206, error_message="Test case not found or access denied")

        # Update fields if provided
        if request.name is not None:
            case.name = request.name
        if request.body is not None:
            case.body = request.body
        if request.expected is not None:
            case.expected = request.expected

        await db.commit()
        await db.refresh(case)

        data = {
            "id": case.id,
            "api_id": case.api_id,
            "name": case.name,
            "body": case.body,
            "expected": case.expected,
            "created_at": case.created_at
        }

        return create_response(200, value_correction(data))

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)
