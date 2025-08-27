from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from config import (
    get_db,
    get_user_by_username
)
from models import Workspace, Node, Api, ApiCase
from utils import (
    ExceptionHandler,
    create_response,
    value_correction
)

router = APIRouter()



@router.post("/case/{case_id}/duplicate")
async def duplicate_test_case(
    case_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Duplicate test case"""
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
        original_case = result.scalar_one_or_none()

        if not original_case:
            return create_response(206, error_message="Test case not found or access denied")

        # Create duplicate with modified name
        duplicate_name = f"{original_case.name} (Copy)" if original_case.name else "Untitled Case (Copy)"

        try:
            headers = original_case.headers.copy() if hasattr(original_case, 'headers') and original_case.headers else {}
            params = original_case.params.copy() if hasattr(original_case, 'params') and original_case.params else {}
            new_case = ApiCase(
                api_id=original_case.api_id,
                name=duplicate_name,
                headers=headers,  # Added headers
                params=params,
                body=original_case.body.copy() if original_case.body else {},
                expected=original_case.expected.copy() if original_case.expected else {}
            )
        except Exception as e:
            # Fallback if headers column doesn't exist yet
            print(f"Warning: Could not include headers field - {str(e)}")
            new_case = ApiCase(
                api_id=original_case.api_id,
                name=duplicate_name,
                body=original_case.body.copy() if original_case.body else {},
                expected=original_case.expected.copy() if original_case.expected else {}
            )

        db.add(new_case)
        await db.commit()
        await db.refresh(new_case)

        try:
            headers = new_case.headers
        except AttributeError:
            headers = None

        data = {
            "id": new_case.id,
            "api_id": new_case.api_id,
            "name": new_case.name,
            "headers": headers,  # Added headers
            "params": new_case.params,
            "body": new_case.body,
            "expected": new_case.expected,
            "created_at": new_case.created_at,
            "original_case_id": case_id
        }

        return create_response(200, value_correction(data))

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)

