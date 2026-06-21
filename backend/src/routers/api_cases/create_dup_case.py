"""
What this file does: Exposes POST /case/{case_id}/duplicate for cloning a test case with a "(Copy)" suffix.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import resolve_case_access
from models import ApiCase
from schema import CaseDuplicateResponse
from utils import ExceptionHandler, create_response

router = APIRouter()


@router.post("/case/{case_id}/duplicate")
async def duplicate_test_case(
    case_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """POST /case/{case_id}/duplicate — create a copy of an existing test case with "(Copy)" appended to the name."""
    try:
        # Step 1: Resolve caller and the source case in one query
        ca = await resolve_case_access(db, username, case_id)
        if ca.user is None:
            return create_response(401, error_message="User not found")
        if ca.case is None or not ca.can_access:
            return create_response(404, error_message="Test case not found or access denied")

        original = ca.case

        # Step 2: Clone the case with a "(Copy)" name and detached copies of its JSON fields
        duplicate_name = f"{original.name} (Copy)" if original.name else "Untitled Case (Copy)"
        new_case = ApiCase(
            api_id=original.api_id,
            name=duplicate_name,
            headers=dict(original.headers) if original.headers else {},
            params=dict(original.params) if original.params else {},
            body=dict(original.body) if original.body else {},
            expected=dict(original.expected) if original.expected else {},
        )

        db.add(new_case)
        await db.commit()
        await db.refresh(new_case)

        # Step 3: Build the response payload
        data = {
            "id": new_case.id,
            "api_id": new_case.api_id,
            "name": new_case.name,
            "headers": new_case.headers,
            "params": new_case.params,
            "body": new_case.body,
            "expected": new_case.expected,
            "created_at": new_case.created_at,
            "original_case_id": case_id,
        }

        return create_response(200, data, CaseDuplicateResponse)

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
