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

router = APIRouter()


@router.delete("/case/{case_id}")
async def delete_test_case(
    case_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Delete test case"""
    try:
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

        # Delete the test case
        await db.delete(case)
        await db.commit()

        return create_response(200, {"message":"Test case deleted successfully"})

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)
