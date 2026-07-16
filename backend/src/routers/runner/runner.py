"""
What this file does: Core runner engine — provides run_from_list_api for executing test cases concurrently against an API definition, and bulk_run_cases for scheduler-driven bulk execution.
"""

import httpx, time, asyncio
from typing import Dict, Any, List, Optional, TypedDict
from routers.runner.validator import evaluate_expect
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from config import get_db
from models import Api, ApiCase, Workspace, Node, WorkspaceMember
from utils import resolve_variables
from common_querys import get_user_by_username, get_headers, resolve_auth, build_scope_chain
from auth_strategies import apply_auth



async def verify_nodes(db: AsyncSession, node_id: list[int], user_id: int) -> List[Any]:
    """
    What it does: Return the column-pruned rows (id, type, workspace_id) for the given node IDs whose workspace the user can access
    (owner or joined member — running tests is a viewer-level action).
    Returns:
        list[Row]: Rows with .id, .type, .workspace_id; excludes IDs whose workspace the user cannot access.
    """
    if not node_id:
        return []
    result = await db.execute(
        select(Node.id, Node.type, Node.workspace_id)
        .join(Workspace, Node.workspace_id == Workspace.id)
        .outerjoin(
            WorkspaceMember,
            and_(
                WorkspaceMember.workspace_id == Workspace.id,
                WorkspaceMember.user_id == user_id,
                WorkspaceMember.joined_at.isnot(None),
            ),
        )
        .where(
            and_(
                Node.id.in_(node_id),
                or_(Workspace.user_id == user_id, WorkspaceMember.user_id.isnot(None)),
            )
        )
    )
    return result.all()


def resolve_docker_url(url: str) -> str:
    """What it does: Replace 'localhost' with 'host.docker.internal' so the container can reach the host machine."""
    return url.replace("localhost", "host.docker.internal") if "localhost" in url else url


async def _run_case(
    client: httpx.AsyncClient,
    headers: Dict[str, str],
    case: Dict[str, Any],
    timeout: int,
    sem: asyncio.Semaphore,
    retries: int = 3,
) -> Dict[str, Any]:
    """What it does: Execute a single test case with exponential-backoff retry on 429/5xx, evaluate expectations, and return a structured result dict."""
    attempt = 0
    backoff = 1

    while attempt < retries:
        try:
            async with sem:
                method = (case.get("method") or "GET").upper()
                url = case.get("endpoint", "")
                merged_headers = {**headers, **(case.get("headers") or {})}
                # None value = "remove this header" (missing-header test cases); str(None)
                # would otherwise leak the literal string "None" onto the wire.
                merged_headers = {str(k): str(v) for k, v in merged_headers.items() if v is not None}

                body = case.get("body")
                params = case.get("params")
                resolved_url = resolve_docker_url(url)
                if params and isinstance(params, dict):
                    remaining_params = {}
                    for k, v in params.items():
                        placeholder = f"{{{k}}}"
                        if placeholder in resolved_url:
                            resolved_url = resolved_url.replace(placeholder, str(v))
                        else:
                            remaining_params[k] = v
                    params = remaining_params if remaining_params else None

                t0 = time.perf_counter()
                resp = await client.request(
                    method,
                    resolved_url,
                    headers=merged_headers,
                    params=params,
                    json=body,
                    timeout=timeout,
                )
                duration_ms = round((time.perf_counter() - t0) * 1000, 2)

                # Retry on "retryable" status codes
                if resp.status_code in {429, 500, 502, 503, 504}:
                    attempt += 1
                    if attempt < retries:
                        await asyncio.sleep(backoff)
                        backoff *= 2
                        continue

                # Evaluate expectations
                expect = case.get("expected", {})
                ok, failures = evaluate_expect(resp, expect)

                try:
                    resp_json = resp.json()
                except Exception:
                    resp_json = None

                return {
                    "case": case.get("name"),
                    "case_id": case.get("id"),
                    "success": ok,
                    "failures": failures,
                    "status_code": resp.status_code,
                    "duration_ms": duration_ms,
                    "api": {"method": method, "endpoint": url, "path": url.split("?", 1)[0]},
                    "request": {
                        "method": method,
                        "url": url,
                        "headers": case.get("headers"),
                        "params": params,
                        "body": body,
                        "expected": expect,
                    },
                    "response": {"status_code": resp.status_code, "json": resp_json},
                }

        except (httpx.TimeoutException, httpx.NetworkError) as e:
            attempt += 1
            if attempt < retries:
                await asyncio.sleep(backoff)
                backoff *= 2
                continue
            return {
                "case": case.get("name"),
                "case_id": case.get("id"),
                "success": False,
                "failures": [f"Request failed after {retries} retries: {str(e)}"],
                "status_code": None,
                "duration_ms": None,
                "api": {"method": case.get("method"), "endpoint": case.get("endpoint"), "path": ""},
                "request": {"method": case.get("method"), "url": case.get("endpoint")},
                "response": {},
            }

        except Exception as e:
            return {
                "case": case.get("name"),
                "case_id": case.get("id"),
                "success": False,
                "failures": [f"Unexpected error: {str(e)}"],
                "status_code": None,
                "duration_ms": None,
                "api": {"method": case.get("method"), "endpoint": case.get("endpoint"), "path": ""},
                "request": {"method": case.get("method"), "url": case.get("endpoint")},
                "response": {},
            }

    # Safety fallback
    return {
        "case": case.get("name"),
        "case_id": case.get("id"),
        "success": False,
        "failures": ["Unexpected exit without result"],
        "status_code": None,
        "duration_ms": None,
        "api": {"method": case.get("method"), "endpoint": case.get("endpoint"), "path": ""},
        "request": {"method": case.get("method"), "url": case.get("endpoint")},
        "response": {},
    }

# ---------- Run from API definition (list of cases) ----------
async def run_from_list_api(data: dict, concurrency: int = 5) -> Dict[str, Any]:
    """
    What it does: Execute all test cases in data concurrently against the API and return a flat result list with per-case pass/fail details.
    Args:
        data: API definition dict containing method, endpoint, headers, extra_meta, test_cases, and optional workspace_variables.
        concurrency: Maximum number of cases running simultaneously; defaults to 5.
    Returns:
        dict[str, Any]: Contains ``"meta"`` (API-level info and case count) and ``"flat"`` (list of per-case result dicts).
    Steps:
        - Step 1: Extract method, endpoint, and merge API-level headers with extra_meta headers
        - Step 2: Build a resolved case list, substituting workspace_variables into endpoint/headers/params/body/expected for each case
        - Step 3: Create a Semaphore limited to concurrency to cap parallel HTTP requests
        - Step 4: Run all cases with asyncio.gather via _run_case against a shared httpx client
        - Step 5: Return meta dict and flat results list
    """
    method = (data.get("method") or "GET").upper()
    endpoint = data.get("endpoint") or "/"
    api_hdrs = data.get("headers") or {}
    extra = data.get("extra_meta") or {}
    if isinstance(extra, dict) and isinstance(extra.get("headers"), dict):
        api_hdrs = {**api_hdrs, **extra["headers"]}

    ts = int(time.time() * 1000)
    workspace_variables = data.get("workspace_variables", {})

    cases = []
    for c in data.get("test_cases", []):
        cases.append({
            "name": c.get("name") or f"case-{c.get('id')}",
            "id": c.get("id"),
            "method": method,
            "endpoint": resolve_variables(c.get("endpoint") or endpoint, workspace_variables, ts),
            "headers": resolve_variables(c.get("headers", {}), workspace_variables, ts),
            "params": resolve_variables(c.get("params", {}), workspace_variables, ts),
            "body": resolve_variables(c.get("body", {}), workspace_variables, ts),
            "expected": resolve_variables(c.get("expected", {}), workspace_variables, ts),
        })

    sem = asyncio.Semaphore(concurrency)
    results: List[Dict[str, Any]] = []

    async with httpx.AsyncClient() as client:
        tasks = [_run_case(client, headers=api_hdrs, case=case, timeout=200, sem=sem) for case in cases]
        results = await asyncio.gather(*tasks)

    return {
        "meta": {"endpoint": endpoint, "method": method, "headers": api_hdrs, "total_cases": len(cases)},
        "flat": results,
    }


class ApiRunData(TypedDict):
    """Resolved run data for one API file, produced by prepare_bulk_run and consumed by execute_bulk_run."""
    id: int
    file_id: int
    name: str
    method: str
    endpoint: str
    headers: Dict[str, Any]
    description: Optional[str]
    is_active: bool
    extra_meta: Dict[str, Any]
    test_cases: List[Dict[str, Any]]
    total_cases: int


async def prepare_bulk_run(db: AsyncSession, data: Any) -> Dict[str, Any]:
    """Resolve all DB data needed for a bulk run — user, nodes, APIs, cases, headers, variables, auth.

    Returns:
        ``{"record": Dict[int, ApiRunData]}`` on success.
        Error dict with ``response_code`` on failure (caller checks for ``"record"`` key).
    """
    req = data.payload
    username = data.username

    user = await get_user_by_username(db, username)
    if not user:
        return {"response_code": 206, "data": {}, "error_message": "user not found"}

    file_ids: List[int] = []
    api_requests: Dict[int, Any] = {}
    if req["type"] == "api":
        file_ids = req["apis"]
        api_requests = {fid: None for fid in req["apis"]}
    elif req["type"] == "selected":
        file_ids = [api["file_id"] for api in req["apis"]]  # type: ignore[index]
        api_requests = {api["file_id"]: api["cases"] for api in req["apis"]}  # type: ignore[index]

    file_nodes = await verify_nodes(db, file_ids, user.id)
    if not file_nodes:
        return {"response_code": 206, "data": {}, "error_message": "File not found or access denied"}

    verified_file_ids = [f.id for f in file_nodes if f.type == "file"]
    apis_by_file: Dict[int, Any] = {}
    cases_by_api: Dict[int, List] = {}
    if verified_file_ids:
        apis = (await db.execute(select(Api).where(Api.file_id.in_(verified_file_ids)))).scalars().all()
        apis_by_file = {api.file_id: api for api in apis}
        api_ids = [api.id for api in apis]
        if api_ids:
            cases_rows = (await db.execute(
                select(
                    ApiCase.id, ApiCase.api_id, ApiCase.name,
                    ApiCase.headers, ApiCase.params, ApiCase.body,
                    ApiCase.expected, ApiCase.created_at,
                ).where(ApiCase.api_id.in_(api_ids))
            )).all()
            for row in cases_rows:
                cases_by_api.setdefault(row.api_id, []).append(row)

    record: Dict[int, ApiRunData] = {}
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

        auth_config = await resolve_auth(db, api.file_id)
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

        cases_data: List[Dict[str, Any]] = []
        selected_cases = api_requests.get(file.id)
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

    return {"record": record}


async def execute_bulk_run(record: Dict[int, ApiRunData]) -> Dict[str, Any]:
    """Execute prepared bulk run data concurrently — no DB access.

    Args:
        record: Mapping of file_id → ApiRunData produced by prepare_bulk_run.

    Returns:
        ``{"response_code": 200, "data": {file_id: run_result}}``
    """
    async def _run_one(file_id: int, api_data: ApiRunData) -> tuple[int, Any]:
        return file_id, await run_from_list_api(api_data)  # type: ignore[arg-type]

    results = await asyncio.gather(*[_run_one(fid, d) for fid, d in record.items()])
    return {"response_code": 200, "data": {fid: result for fid, result in results}}


async def bulk_run_cases(
    data: Any,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Thin wrapper used by the scheduler engine — prepare DB data then execute HTTP.

    Notes:
        - Not a route handler; the engine passes db explicitly.
        - Returns plain dict (not JSONResponse) so the engine can inspect response_code.
        - Batch 4 engine will call prepare_bulk_run + execute_bulk_run directly with proper session lifecycle.
    """
    result = await prepare_bulk_run(db, data)
    if "record" not in result:
        return result
    return await execute_bulk_run(result["record"])
