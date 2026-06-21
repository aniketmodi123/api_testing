"""
What this file does: Exposes DELETE /case/{case_id} (single) and DELETE /cases/bulk for removing test cases.
"""

from typing import List

from fastapi import APIRouter, Depends, Header
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import get_user_by_username, resolve_case_access, write_audit
from models import Api, ApiCase, Node, Workspace
from schema import BulkDeleteResponse
from utils import ExceptionHandler, create_response

router = APIRouter()


@router.delete("/case/{case_id}")
async def delete_test_case(
    case_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """DELETE /case/{case_id} — delete a single test case after verifying ownership through the API → file → workspace chain."""
    try:
        # Step 1: Resolve caller, case, and its file node in one query
        ca = await resolve_case_access(db, username, case_id)
        if ca.user is None:
            return create_response(401, error_message="User not found")
        if ca.case is None or not ca.can_access:
            return create_response(404, error_message="Test case not found or access denied")

        # Step 2: Audit (workspace_id comes from the resolved node — no extra query) and delete
        await write_audit(
            db,
            username=ca.user.username,
            action="api_case.delete",
            entity_type="api_case",
            entity_id=case_id,
            workspace_id=ca.node.workspace_id,
        )
        await db.delete(ca.case)
        await db.commit()

        return create_response(200, message="Test case deleted successfully")

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)


@router.delete("/cases/bulk")
async def delete_test_cases_bulk(
    case_ids: List[int],
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """DELETE /cases/bulk — delete multiple test cases by ID; report any IDs not found or not owned by the caller."""
    try:
        # Step 1: Guard empty input before any DB work
        if not case_ids:
            return create_response(400, error_message="No case IDs provided")

        user = await get_user_by_username(db, username)
        if not user:
            return create_response(401, error_message="User not found")

        # Step 2: Fetch the owned subset of the requested cases (in_() is guarded above)
        result = await db.execute(
            select(ApiCase)
            .join(Api, ApiCase.api_id == Api.id)
            .join(Node, Api.file_id == Node.id)
            .join(Workspace, Node.workspace_id == Workspace.id)
            .where(
                and_(
                    ApiCase.id.in_(case_ids),
                    Workspace.user_id == user.id,
                )
            )
        )
        cases = result.scalars().all()

        if not cases:
            return create_response(404, error_message="No test cases found or access denied")

        found_ids = [case.id for case in cases]
        not_found_ids = [cid for cid in case_ids if cid not in found_ids]

        # Step 3: Delete the owned cases and report the outcome
        for case in cases:
            await db.delete(case)
        await db.commit()

        data = {
            "deleted_count": len(found_ids),
            "deleted_ids": found_ids,
        }
        message = f"Successfully deleted {len(found_ids)} test case(s)"
        if not_found_ids:
            data["not_found_ids"] = not_found_ids
            message += f". {len(not_found_ids)} case(s) not found or access denied"

        return create_response(200, data, BulkDeleteResponse, message=message)

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
