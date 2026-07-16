"""
What this file does: Exposes POST /bulk_run_cases for concurrently executing test cases across multiple APIs, returning results mapped into the workspace node tree.
"""

from datetime import datetime
import asyncio
from typing import Union, List, Optional, Dict, Any

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth_strategies import apply_auth
from common_querys import resolve_workspace_access, get_headers, build_scope_chain
from config import get_db
from models import Api, ApiCase, Node
from routers.runner.runner import run_from_list_api, verify_nodes
from schema import BulkRunCasesResponse
from utils import create_response, value_correction, resolve_variables


class BulkRunnerApi(BaseModel):
    """Run all test cases for a list of file IDs.
    Attributes:
        type: Must be ``"api"``.
        apis: List of file node IDs whose APIs to run.
    """
    type: str  # should be 'api'
    apis: List[int]


class BulkRunnerSelectedApi(BaseModel):
    """Per-file selection of test cases for bulk run.
    Attributes:
        file_id: File node ID to target.
        cases: Optional list of ApiCase IDs to run; None runs all cases for the file.
    """
    file_id: int
    cases: Optional[List[int]] = None


class BulkRunnerSelected(BaseModel):
    """Run selected test cases across multiple files.
    Attributes:
        type: Must be ``"selected"``.
        apis: List of per-file selections specifying which cases to run.
    """
    type: str  # should be 'selected'
    apis: List[BulkRunnerSelectedApi]


router = APIRouter()


@router.post("/bulk_run_cases")
async def bulk_run_cases(
    req: Union[BulkRunnerApi, BulkRunnerSelected],
    username: str = Header(...),
    workspace_id: int = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Execute test cases across multiple APIs concurrently and return results mapped into the workspace node tree.

    Steps:
        - Step 1: Authenticate caller and verify viewer access to the workspace (1 query).
        - Step 2: Collect target file IDs from the request; verify per-node access via verify_nodes.
        - Step 3: Batch-fetch API metadata and test cases in two column-pruned queries.
        - Step 4: For each accessible file node, resolve inherited headers, scope-chain variables, and auth config; build the run record.
        - Step 5: Execute all run records concurrently via asyncio.gather.
        - Step 6: Fetch workspace nodes (column-pruned), build the O(n) tree with run results inline, and return.
    """
    # Step 1: Auth + workspace check (1 query via resolve_workspace_access)
    access = await resolve_workspace_access(db, username, workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if access.workspace_id is None:
        return create_response(404, error_message="Workspace not found")
    if not access.can_access:
        return create_response(403, error_message="Access denied to this workspace")

    # Step 2: Collect file IDs from request and verify per-node workspace access
    file_ids: List[int]
    api_requests: Dict[int, Optional[List[int]]]
    if req.type == "api":
        file_ids = req.apis
        api_requests = {fid: None for fid in req.apis}
    else:  # "selected"
        file_ids = [api.file_id for api in req.apis]  # type: ignore
        api_requests = {api.file_id: api.cases for api in req.apis}  # type: ignore

    if not file_ids:
        return create_response(404, error_message="File not found or access denied")

    file_nodes = await verify_nodes(db, file_ids, access.user.id)
    if not file_nodes:
        return create_response(404, error_message="File not found or access denied")

    # Step 3: Batch-fetch APIs and cases in two column-pruned queries (no selectinload)
    verified_file_ids = [f.id for f in file_nodes if f.type == "file"]

    api_rows: List[Any] = []
    if verified_file_ids:
        api_rows = (await db.execute(
            select(Api.id, Api.file_id, Api.name, Api.method, Api.endpoint,
                   Api.description, Api.is_active, Api.extra_meta)
            .where(Api.file_id.in_(verified_file_ids))
        )).all()
    apis_by_file: Dict[int, Any] = {row.file_id: row for row in api_rows}
    api_ids = [row.id for row in api_rows]

    # Batch-fetch cases (column-pruned, guarded against empty api_ids)
    cases_by_api: Dict[int, List[Any]] = {}
    if api_ids:
        case_rows = (await db.execute(
            select(ApiCase.id, ApiCase.name, ApiCase.headers, ApiCase.params,
                   ApiCase.body, ApiCase.expected, ApiCase.created_at, ApiCase.api_id)
            .where(ApiCase.api_id.in_(api_ids))
        )).all()
        for row in case_rows:
            cases_by_api.setdefault(row.api_id, []).append(row)

    # Step 4: Build run records — serial per file (each needs its own path walk for header inheritance + scope chain)
    record: Dict[int, Dict[str, Any]] = {}
    for file in file_nodes:
        if file.type != "file":
            continue

        api = apis_by_file.get(file.id)
        if not api:
            continue

        folder_path, folder_ids, headers_map, merge_result = await get_headers(db, api.file_id)
        if not folder_path:
            continue

        workspace_variables = await build_scope_chain(
            db, file_id=file.id, username=username, workspace_id=file.workspace_id
        )
        resolved_endpoint = resolve_variables(api.endpoint, workspace_variables)
        resolved_headers: Dict[str, Any] = dict(merge_result.get("merged_headers", {}))
        resolved_extra_meta = resolve_variables(api.extra_meta or {}, workspace_variables)

        # Inline auth extraction — avoids resolve_auth's redundant path walk + Api re-fetch per file
        file_auth = (api.extra_meta or {}).get("auth")
        auth_config = file_auth if (file_auth and file_auth.get("type", "none") != "none") else None
        if auth_config:
            auth_headers, _ = apply_auth(
                auth_config,
                method=api.method.upper(),
                url=resolved_endpoint,
                existing_headers=resolved_headers,
            )
            for k, v in auth_headers.items():
                if k not in resolved_headers:
                    resolved_headers[k] = v

        selected_cases = api_requests.get(file.id)
        cases_data = []
        for case in cases_by_api.get(api.id, []):
            if selected_cases and case.id not in selected_cases:
                continue
            merged_headers = {**resolved_headers, **(case.headers or {})}
            cases_data.append({
                "id": case.id,
                "name": case.name,
                "headers": resolve_variables(merged_headers, workspace_variables),
                "params": resolve_variables(case.params or {}, workspace_variables),
                "body": resolve_variables(case.body, workspace_variables),
                "expected": case.expected,
                "created_at": case.created_at,
            })

        if cases_data:
            record[file.id] = {
                "id": api.id,
                "file_id": api.file_id,
                "name": api.name,
                "method": api.method,
                "endpoint": resolved_endpoint,
                "headers": resolved_headers,
                "description": api.description,
                "is_active": api.is_active,
                "extra_meta": resolved_extra_meta,
                "test_cases": cases_data,
                "total_cases": len(cases_data),
            }

    # Step 5: Execute all run records concurrently
    async def run_api(file_id: int, data: Dict[str, Any]) -> tuple:
        """What it does: Run one API's cases and return (file_id, result) for gather collection."""
        return file_id, await run_from_list_api(data)

    results = await asyncio.gather(*[run_api(fid, data) for fid, data in record.items()])
    results_dict: Dict[int, Any] = {fid: result for fid, result in results}

    # Step 6: Fetch workspace nodes (column-pruned) and build the result tree
    node_rows = (await db.execute(
        select(Node.id, Node.name, Node.type, Node.parent_id, Node.created_at)
        .where(Node.workspace_id == workspace_id)
    )).all()

    node_dict: Dict[int, Dict[str, Any]] = {
        row.id: {
            "id": row.id,
            "name": row.name,
            "type": row.type,
            "parent_id": row.parent_id,
            "created_at": row.created_at,
        }
        for row in node_rows
    }

    # Pre-build children index for O(n) tree construction (was O(n²))
    children_by_parent: Dict[Optional[int], List[int]] = {}
    for nid, n in node_dict.items():
        children_by_parent.setdefault(n["parent_id"], []).append(nid)

    def build_tree(node_id: int) -> Optional[Dict[str, Any]]:
        """What it does: Return a pruned node dict with run results for file nodes, or None when the subtree holds no run data."""
        node = node_dict[node_id]
        children = []
        for cid in children_by_parent.get(node_id, []):
            child = build_tree(cid)
            if child:
                children.append(child)
        if node["type"] == "file":
            run_data = results_dict.get(node_id)
            return {"file_id": node_id, **run_data} if run_data else None
        return {**node, "children": children} if children else None

    root_nodes = []
    for nid in children_by_parent.get(None, []):
        node = build_tree(nid)
        if node:
            root_nodes.append(node)

    data = {
        "created_at": datetime.now(),
        "file_tree": root_nodes,
        "total_nodes": len(node_rows),
    }
    return create_response(200, value_correction(data), schema=BulkRunCasesResponse)
