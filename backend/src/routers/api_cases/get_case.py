from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from config import (
    get_db,
    get_headers,
    get_user_by_username
)
from models import Workspace, Node, Api, ApiCase
from utils import (
    ExceptionHandler,
    create_response,
    value_correction
)

router = APIRouter()


@router.get("/case/{case_id}")
async def get_test_case_details(
    case_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Get specific test case details with API and file context"""
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

        # Get API and file details
        api_result = await db.execute(
            select(Api).where(Api.id == case.api_id)
        )
        api = api_result.scalar_one()

        file_result = await db.execute(
            select(Node).where(Node.id == api.file_id)
        )
        file_node = file_result.scalar_one()


        case_headers = case.headers or {}

        # Params if present on the case
        try:
            case_params = case.params or {}
        except AttributeError:
            case_params = {}

        data = {
            "id": case.id,
            "api_id": case.api_id,
            "name": case.name,
            "headers": case_headers,  # Combined headers
            "case_specific_headers": case_headers,  # Case-specific headers only
            "params": case_params,
            "body": case.body,
            "expected": case.expected,
            "created_at": case.created_at,
            "api_name": api.name,
            "api_method": api.method,
            "api_endpoint": api.endpoint,
            "file_id": api.file_id,
            "file_name": file_node.name,
            "workspace_id": file_node.workspace_id
        }

        return create_response(200, value_correction(data))

    except Exception as e:
        ExceptionHandler(e)
