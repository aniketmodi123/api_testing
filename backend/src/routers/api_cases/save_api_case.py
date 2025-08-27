from typing import Optional, List
from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from config import (
    get_db,
    get_user_by_username,
    verify_node_ownership
)
from models import Api, ApiCase, Workspace, Node
from schema import ApiCaseCreateRequest
from utils import (
    ExceptionHandler,
    create_response,
    value_correction
)
from validator import validate_expected_spec

router = APIRouter()

@router.post("/file/{file_id}/api/cases/save")
async def save_api_case(
    file_id: int,
    request: ApiCaseCreateRequest,
    case_id: Optional[int] = None,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Create or update test case for API in a specific file"""
    try:
        # Validate expected response spec
        if request.expected is not None:
            ok, errors = validate_expected_spec(request.expected)
            if not ok:
                # Shape errors only (not runtime); return 422 with reasons
                return create_response(422, error_message=f"Invalid expected schema, reasons: {errors}")

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

        status_code = 200

        # Check if this is an update or create operation
        if case_id:
            # UPDATING EXISTING TEST CASE
            # Verify test case ownership through API -> file -> workspace -> user
            result = await db.execute(
                select(ApiCase)
                .join(Api, ApiCase.api_id == Api.id)
                .join(Node, Api.file_id == Node.id)
                .join(Workspace, Node.workspace_id == Workspace.id)
                .where(
                    and_(
                        ApiCase.id == case_id,
                        Workspace.user_id == user.id,
                        Api.id == api.id
                    )
                )
            )
            case = result.scalar_one_or_none()

            if not case:
                return create_response(206, error_message="Test case not found or access denied")

            # Update fields
            if request.name is not None:
                case.name = request.name

            # Update headers, body and expected fields
            if request.headers is not None:
                case.headers = request.headers

            if request.body is not None:
                case.body = request.body

            if request.params is not None:
                case.params = request.params

            if request.expected is not None:
                case.expected = request.expected

            await db.commit()
            await db.refresh(case)

            message = f"Test case '{case.name}' updated successfully"
        else:
            # CREATING NEW TEST CASE
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
            case = ApiCase(
                api_id=api.id,
                name=request.name,
                headers=request.headers,
                params=request.params,
                body=request.body,
                expected=request.expected
            )

            db.add(case)
            await db.commit()
            await db.refresh(case)

            status_code = 201
            message = f"Test case '{case.name}' created successfully"

        # Prepare response data
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
            "file_name": file_node.name,
            "workspace_id": file_node.workspace_id,
            "message": message
        }

        return create_response(status_code, value_correction(data))

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)


@router.post("/file/{file_id}/api/cases/bulk")
async def bulk_create_api_cases(
    file_id: int,
    requests: List[ApiCaseCreateRequest],
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Create multiple test cases for API in a file in one request"""
    try:
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

        # Basic checks: duplicate names in payload
        names = [r.name for r in requests]
        dup_names = sorted({n for n in names if names.count(n) > 1})
        if dup_names:
            return create_response(400, error_message=f"Duplicate case names in payload: {', '.join(dup_names)}")

        # Check for existing cases with same names
        existing_q = await db.execute(
            select(ApiCase.name).where(ApiCase.api_id == api.id).where(ApiCase.name.in_(names))
        )
        existing = [row[0] for row in existing_q.fetchall()]
        if existing:
            return create_response(400, error_message=f"Test case(s) already exist: {', '.join(existing)}")

        # Validate expected shapes for each case
        invalids = []
        for idx, case_req in enumerate(requests):
            if case_req.expected is not None:
                ok, errs = validate_expected_spec(case_req.expected)
                if not ok:
                    invalids.append({"index": idx, "name": case_req.name, "errors": errs})

        if invalids:
            return create_response(422, error_message="One or more cases invalid", data={"errors": invalids})

        # Create all cases in one transaction
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

        await db.commit()

        # Refresh and prepare response
        for c in created:
            await db.refresh(c)

        out = []
        for c in created:
            out.append({
                "id": c.id,
                "api_id": c.api_id,
                "name": c.name,
                "headers": c.headers,
                "params": c.params,
                "body": c.body,
                "expected": c.expected,
                "created_at": c.created_at
            })

        return create_response(201, {"created": out, "count": len(out)})

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)
