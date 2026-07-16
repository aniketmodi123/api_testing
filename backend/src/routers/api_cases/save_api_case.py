"""
What this file does: Exposes POST /file/{file_id}/api/cases/save (single) and POST /file/{file_id}/api/cases/bulk for creating or updating API test cases.
"""

from collections import Counter
from typing import Optional, List
from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import has_min_role, resolve_file_access, write_audit
from models import ApiCase
from schema import ApiCaseCreateRequest, ApiCaseDetailResponse, BulkCaseCreateResponse
from utils import ExceptionHandler, create_response
from routers.runner.validator import validate_expected_spec

router = APIRouter()


@router.post("/file/{file_id}/api/cases/save")
async def save_api_case(
    file_id: int,
    request: ApiCaseCreateRequest,
    case_id: Optional[int] = None,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Create a new test case or update an existing one when case_id is provided.
    Steps:
        - Step 1: Validate expected spec, then resolve file access and the file's API in one query
        - Step 2: Update the case scoped to this API, or create after a duplicate-name check
        - Step 3: Write audit, commit, and return the saved case with API/file context
    """
    try:
        # Step 1: Validate expected response spec before any DB work
        if request.expected is not None:
            ok, errors = validate_expected_spec(request.expected)
            if not ok:
                return create_response(422, error_message=f"Invalid expected schema, reasons: {errors}")

        # Step 1: Resolve caller, file node, and its API in one query
        fa = await resolve_file_access(db, username, file_id)
        if fa.user is None:
            return create_response(401, error_message="User not found")
        if fa.node is None or not fa.can_access:
            return create_response(404, error_message="File not found or access denied")
        if fa.node.type != "file":
            return create_response(400, error_message="Can only create test cases for APIs in files, not folders")
        if fa.api is None:
            return create_response(404, error_message="No API found in this file")
        # Role already joined by resolve_file_access — no extra query needed
        if not has_min_role(fa, "editor"):
            return create_response(403, error_message="Editor access or higher required")

        api = fa.api
        status_code = 200

        # Step 2: Update an existing case (access already proven via file ownership)
        if case_id:
            result = await db.execute(
                select(ApiCase).where(ApiCase.id == case_id, ApiCase.api_id == api.id)
            )
            case = result.scalar_one_or_none()
            if not case:
                return create_response(404, error_message="Test case not found or access denied")

            if request.name is not None:
                case.name = request.name
            if request.headers is not None:
                case.headers = request.headers
            if request.body is not None:
                case.body = request.body
            if request.params is not None:
                case.params = request.params
            if request.expected is not None:
                case.expected = request.expected

            await write_audit(db, username=fa.user.username, action="api_case.update", entity_type="api_case", entity_id=case.id, workspace_id=fa.node.workspace_id)
            await db.commit()

            message = f"Test case '{case.name}' updated successfully"
        else:
            # Step 2: Create a new case after a duplicate-name check for this API
            existing = await db.execute(
                select(ApiCase.id).where(ApiCase.api_id == api.id, ApiCase.name == request.name)
            )
            if existing.scalar_one_or_none() is not None:
                return create_response(409, error_message="Test case with this name already exists for this API")

            case = ApiCase(
                api_id=api.id,
                name=request.name,
                headers=request.headers,
                params=request.params,
                body=request.body,
                expected=request.expected
            )
            db.add(case)
            await write_audit(db, username=fa.user.username, action="api_case.create", entity_type="api_case", workspace_id=fa.node.workspace_id)
            await db.commit()

            status_code = 201
            message = f"Test case '{case.name}' created successfully"

        # Step 3: Build the response payload
        data = {
            "id": case.id,
            "api_id": case.api_id,
            "name": case.name,
            "headers": case.headers,
            "params": case.params,
            "body": case.body,
            "expected": case.expected,
            "created_at": case.created_at,
            "api_name": api.name,
            "api_method": api.method,
            "api_endpoint": api.endpoint,
            "file_id": file_id,
            "file_name": fa.node.name,
            "workspace_id": fa.node.workspace_id,
        }

        return create_response(status_code, data, ApiCaseDetailResponse, message=message)

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)


@router.post("/file/{file_id}/api/cases/bulk")
async def bulk_create_api_cases(
    file_id: int,
    requests: List[ApiCaseCreateRequest],
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Create multiple test cases in one transaction; reject duplicates within payload or against existing cases.
    Steps:
        - Step 1: Resolve file access and its API, then reject empty payloads
        - Step 2: Reject in-payload duplicate names and names already stored for the API
        - Step 3: Validate each expected spec, create all cases, commit, and return them
    """
    try:
        # Step 1: Resolve caller, file node, and its API in one query
        fa = await resolve_file_access(db, username, file_id)
        if fa.user is None:
            return create_response(401, error_message="User not found")
        if fa.node is None or not fa.can_access:
            return create_response(404, error_message="File not found or access denied")
        if fa.node.type != "file":
            return create_response(400, error_message="Can only create test cases for APIs in files, not folders")
        if fa.api is None:
            return create_response(404, error_message="No API found in this file")
        # Role already joined by resolve_file_access — no extra query needed
        if not has_min_role(fa, "editor"):
            return create_response(403, error_message="Editor access or higher required")

        api = fa.api

        if not requests:
            return create_response(400, error_message="No cases provided")

        # Step 2: Reject duplicate names within the payload
        names = [r.name for r in requests]
        dup_names = sorted(n for n, count in Counter(names).items() if count > 1)
        if dup_names:
            return create_response(409, error_message=f"Duplicate case names in payload: {', '.join(dup_names)}")

        # Step 2: Reject names already stored for this API
        existing_q = await db.execute(
            select(ApiCase.name).where(ApiCase.api_id == api.id, ApiCase.name.in_(names))
        )
        existing = [row[0] for row in existing_q.fetchall()]
        if existing:
            return create_response(409, error_message=f"Test case(s) already exist: {', '.join(existing)}")

        # Step 3: Validate expected shapes for each case
        invalids = []
        for idx, case_req in enumerate(requests):
            if case_req.expected is not None:
                ok, errs = validate_expected_spec(case_req.expected)
                if not ok:
                    invalids.append({"index": idx, "name": case_req.name, "errors": errs})
        if invalids:
            return create_response(422, error_message="One or more cases invalid", data={"errors": invalids})

        # Step 3: Create all cases in one transaction
        created = []
        for r in requests:
            new_case = ApiCase(
                api_id=api.id,
                name=r.name,
                headers=r.headers,
                params=r.params,
                body=r.body,
                expected=r.expected
            )
            db.add(new_case)
            created.append(new_case)

        # expire_on_commit=False keeps flushed ids/defaults loaded — no per-row refresh needed
        await db.commit()

        out = [
            {
                "id": c.id,
                "api_id": c.api_id,
                "name": c.name,
                "headers": c.headers,
                "params": c.params,
                "body": c.body,
                "expected": c.expected,
                "created_at": c.created_at,
            }
            for c in created
        ]

        return create_response(201, {"created": out, "count": len(out)}, BulkCaseCreateResponse)

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
