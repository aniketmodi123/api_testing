"""
What this file does: Exposes DELETE /case/{case_id} (single) and DELETE /cases/bulk for removing test cases.
"""

from typing import List
from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import get_user_by_username, write_audit
from models import Workspace, Node, Api, ApiCase
from utils import (
    ExceptionHandler,
    create_response
)

router = APIRouter()


@router.delete("/case/{case_id}")
async def delete_test_case(
    case_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """DELETE /case/{case_id} — delete a single test case after verifying ownership through the API → file → workspace chain."""
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

        # Resolve workspace_id for audit (case.api → node → workspace)
        ws_result = await db.execute(
            select(Workspace.id)
            .join(Node, Node.workspace_id == Workspace.id)
            .join(Api, Api.file_id == Node.id)
            .where(Api.id == case.api_id)
        )
        ws_id = ws_result.scalar_one_or_none()

        await write_audit(db, username=user.username, action="api_case.delete", entity_type="api_case", entity_id=case_id, workspace_id=ws_id)
        await db.delete(case)
        await db.commit()

        return create_response(200, {"message": "Test case deleted successfully"})

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)


@router.delete("/cases/bulk")
async def delete_test_cases_bulk(
    case_ids: List[int],
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """DELETE /cases/bulk — delete multiple test cases by ID; report any IDs not found or not owned by the caller."""
    try:
        if not case_ids:
            return create_response(400, error_message="No case IDs provided")

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
                    ApiCase.id.in_(case_ids),
                    Workspace.user_id == user.id
                )
            )
        )
        cases = result.scalars().all()

        if not cases:
            return create_response(206, error_message="No test cases found or access denied")

        found_ids = [case.id for case in cases]
        not_found_ids = [case_id for case_id in case_ids if case_id not in found_ids]

        # Delete the test cases
        for case in cases:
            await db.delete(case)

        await db.commit()

        response_data = {
            "message": f"Successfully deleted {len(cases)} test case(s)",
            "deleted_count": len(cases),
            "deleted_ids": found_ids
        }

        if not_found_ids:
            response_data["not_found_ids"] = not_found_ids
            response_data["message"] += f". {len(not_found_ids)} case(s) not found or access denied"

        return create_response(200, response_data)

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)
