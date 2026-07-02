"""
What this file does: Runs live HTTP requests against each API path in a stored spec and validates responses against the spec's response schema; returns a per-path violation report.
"""

import asyncio
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from common_querys import can_access_workspace, get_user_by_username
from config import get_db
from models import Api, ApiSpec, Node
from routers.runner.execute_direct import send_request
from utils import ExceptionHandler, create_response

try:
    import jsonschema as _jsonschema
    _JSONSCHEMA_AVAILABLE = True
except ImportError:
    _JSONSCHEMA_AVAILABLE = False

router = APIRouter()

_SEMAPHORE_LIMIT = 5
_DEFAULT_PATH_LIMIT = 50


# ---------- Pydantic schemas ----------

class ContractTestBody(BaseModel):
    """Request body for POST /spec/{spec_id}/contract-test.

    Attributes:
        workspace_id: Workspace whose APIs are matched against spec paths.
        limit: Max number of paths to test; defaults to 50.
        timeout: Per-request timeout in seconds; defaults to 10.
    """

    workspace_id: int
    limit: int = _DEFAULT_PATH_LIMIT
    timeout: float = 10.0


class ContractTestResponse(BaseModel):
    """Represent the violation report from POST /spec/{spec_id}/contract-test.

    Attributes:
        spec_id: ApiSpec tested against.
        tested: Number of spec paths fired.
        passed: Paths whose live response matched the spec's response schema.
        failed: Paths whose live response violated the spec's response schema.
        unmatched: Spec paths with no corresponding Api in the workspace.
        results: Per-path result dicts — method, path, status, violations, error.
    """

    spec_id: int
    tested: int
    passed: int
    failed: int
    unmatched: int
    results: List[Dict[str, Any]]


# ---------- Helpers ----------

def _get_response_schema(operation: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """What it does: Extract the JSON schema for the 200 response body from an OpenAPI operation dict; return None when not defined."""
    resp_200 = operation.get("responses", {}).get("200", {})
    content = resp_200.get("content", {})
    schema = content.get("application/json", {}).get("schema")
    return schema


def _validate_body(body: Any, schema: Dict[str, Any]) -> List[Dict[str, Any]]:
    """What it does: Validate body against a JSON schema; return a list of {path, message} violation dicts."""
    if not _JSONSCHEMA_AVAILABLE:
        return [{"path": "root", "message": "jsonschema not installed — validation skipped"}]
    violations = []
    try:
        v = _jsonschema.Draft7Validator(schema)
        for err in v.iter_errors(body):
            violations.append({
                "path": ".".join(str(p) for p in err.absolute_path) or "root",
                "message": err.message,
            })
    except Exception as e:
        violations.append({"path": "root", "message": f"Schema validation error: {e}"})
    return violations


async def _test_one_path(
    method: str,
    path: str,
    operation: Dict[str, Any],
    api: Optional[Any],
    timeout: float,
    sem: asyncio.Semaphore,
) -> Dict[str, Any]:
    """What it does: Issue one live request for a spec path and return a result dict with violations or error."""
    async with sem:
        if api is None:
            return {
                "method": method,
                "path": path,
                "status": "unmatched",
                "violations": [],
                "error": None,
            }

        try:
            result = await send_request(
                method=method,
                url=api.endpoint,
                headers={},
                params={},
                body=None,
                timeout=timeout,
            )
        except Exception as e:
            return {
                "method": method,
                "path": path,
                "status": "unreachable",
                "violations": [],
                "error": str(e),
            }

        schema = _get_response_schema(operation)
        if not schema:
            return {
                "method": method,
                "path": path,
                "status": "no_schema",
                "status_code": result.get("status_code"),
                "violations": [],
                "error": None,
            }

        body = result.get("json")
        if body is None:
            return {
                "method": method,
                "path": path,
                "status": "non_json_body",
                "status_code": result.get("status_code"),
                "violations": [],
                "error": None,
            }

        violations = _validate_body(body, schema)
        return {
            "method": method,
            "path": path,
            "status": "failed" if violations else "passed",
            "status_code": result.get("status_code"),
            "violations": violations,
            "error": None,
        }


# ---------- Route handler ----------

@router.post("/spec/{spec_id}/contract-test")
async def contract_test(
    spec_id: int,
    payload: ContractTestBody,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /spec/{spec_id}/contract-test — fire live requests for each spec path and validate responses against the response schema.

    Steps:
        - Step 1: Authenticate user; verify editor access on workspace.
        - Step 2: Load ApiSpec; verify it belongs to the workspace; use parsed (inlined) spec.
        - Step 3: Extract all (method, path, operation) tuples from parsed spec; cap at limit.
        - Step 4: For each path, look up the matching Api in the workspace by endpoint.
        - Step 5: Fire all requests concurrently (semaphore=5); validate each response body.
        - Step 6: Aggregate results and return violation summary.
    """
    try:
        # Step 1: auth + RBAC
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")
        access = await can_access_workspace(db, payload.workspace_id, user.id, min_role="editor")
        if not access:
            return create_response(403, error_message="Access denied")

        # Step 2: load spec
        spec = (await db.execute(select(ApiSpec).where(ApiSpec.id == spec_id))).scalar_one_or_none()
        if not spec:
            return create_response(404, error_message="Spec not found")
        if spec.workspace_id != payload.workspace_id:
            return create_response(403, error_message="Spec does not belong to this workspace")

        parsed = spec.parsed or spec.raw or {}
        paths_obj = parsed.get("paths", {})

        # Step 3: collect operations up to limit
        ops: List[tuple] = []
        for path, path_item in paths_obj.items():
            if not isinstance(path_item, dict):
                continue
            for method in ("get", "post", "put", "patch", "delete"):
                op = path_item.get(method)
                if isinstance(op, dict):
                    ops.append((method.upper(), path, op))
                    if len(ops) >= payload.limit:
                        break
            if len(ops) >= payload.limit:
                break

        # Step 4: load workspace APIs keyed by (method, endpoint)
        apis_q = (
            select(Api)
            .join(Node, Api.file_id == Node.id)
            .where(and_(Node.workspace_id == payload.workspace_id, Api.is_active == True))
        )
        all_apis = (await db.execute(apis_q)).scalars().all()
        api_map: Dict[tuple, Any] = {}
        for api in all_apis:
            key = (api.method.upper(), api.endpoint)
            api_map[key] = api

        # Step 5: concurrent requests with semaphore
        sem = asyncio.Semaphore(_SEMAPHORE_LIMIT)
        tasks = [
            _test_one_path(method, path, op, api_map.get((method, path)), payload.timeout, sem)
            for method, path, op in ops
        ]
        results = await asyncio.gather(*tasks)

        # Step 6: aggregate
        passed = sum(1 for r in results if r["status"] == "passed")
        failed = sum(1 for r in results if r["status"] == "failed")
        unmatched = sum(1 for r in results if r["status"] == "unmatched")

        return create_response(200, data={
            "spec_id": spec_id,
            "tested": len(results),
            "passed": passed,
            "failed": failed,
            "unmatched": unmatched,
            "results": results,
        }, schema=ContractTestResponse)
    except Exception as e:
        return ExceptionHandler(e)
