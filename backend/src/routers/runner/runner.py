import httpx, time, asyncio
from typing import Dict, Any, List
from routers.runner.validator import evaluate_expect
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from config import get_db
from models import Api, Workspace, Node
from utils import ExceptionHandler, resolve_variables
from common_querys import get_user_by_username, get_workspace_variables, get_headers



async def verify_nodes(db: AsyncSession, node_id: list[int], user_id: int):
    result = await db.execute(
        select(Node)
        .join(Workspace, Node.workspace_id == Workspace.id)
        .where(and_(Node.id.in_(node_id), Workspace.user_id == user_id))
    )
    return result.scalars().all()


def resolve_docker_url(url: str) -> str:
    return url.replace("localhost", "host.docker.internal") if "localhost" in url else url


async def _run_case(
    client: httpx.AsyncClient,
    headers: Dict[str, str],
    case: Dict[str, Any],
    timeout: int,
    sem: asyncio.Semaphore,
    retries: int = 3,
) -> Dict[str, Any]:
    attempt = 0
    backoff = 1

    while attempt < retries:
        try:
            async with sem:
                method = (case.get("method") or "GET").upper()
                url = case.get("endpoint", "")
                merged_headers = {**headers, **case.get("headers", {})}
                merged_headers = {str(k): str(v) for k, v in merged_headers.items()}

                body = case.get("body")
                params = case.get("params")
                resolved_url = resolve_docker_url(url)

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



async def bulk_run_cases(
    data,
    db: AsyncSession = Depends(get_db),
):
    try:
        req = data.payload
        username = data.username
        workspace_id = data.workspace_id
        # ---- Verify User ----
        user = await get_user_by_username(db, username)
        if not user:
            return {
                    "response_code": 206,
                    "data": {},
                    "error_message": "user not found"
                }

        # ---- Collect File IDs ----
        file_ids, api_requests = [], {}
        if req["type"] == "api":
            file_ids = req["apis"]
            api_requests = {fid: None for fid in req["apis"]}
        elif req["type"] == "selected":
            file_ids = [api["file_id"] for api in req["apis"]]  # type: ignore
            api_requests = {api["file_id"]: api["cases"] for api in req["apis"]}  # type: ignore

        file_nodes = await verify_nodes(db, file_ids, user.id)
        if not file_nodes:
            return {
                "response_code": 206,
                "data": {},
                "error_message": "File not found or access denied"
            }

        # ---- Batch Query APIs for all files ----
        query = select(Api).where(Api.file_id.in_(file_ids)).options(selectinload(Api.cases))
        apis = (await db.execute(query)).scalars().all()
        apis_by_file = {api.file_id: api for api in apis}

        # ---- Build Run Records ----
        record = {}
        for file in file_nodes:
            if file.type != "file":
                continue

            api = apis_by_file.get(file.id)
            if not api:
                continue

            folder_path, folder_ids, headers_map, merge_result = await get_headers(db, api.file_id)
            if not folder_path:
                continue

            workspace_variables = await get_workspace_variables(db, file.workspace_id)
            resolved_endpoint = resolve_variables(api.endpoint, workspace_variables)
            resolved_headers = merge_result.get("merged_headers", {})
            resolved_extra_meta = resolve_variables(api.extra_meta or {}, workspace_variables)

            cases_data = []
            selected_cases = api_requests.get(file.id)
            for case in api.cases:
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
                    "created_at": case.created_at
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

        # ---- Run APIs concurrently ----
        async def run_api(file_id, data):
            return file_id, await run_from_list_api(data)

        results = await asyncio.gather(*[run_api(fid, data) for fid, data in record.items()])
        results_dict = {fid: result for fid, result in results}
        return {
            "response_code": 200,
            "data": results_dict
        }

        # # ---- Fetch Workspace and Nodes ----
        # result = await db.execute(
        #     select(Workspace).options(selectinload(Workspace.nodes)).where(Workspace.id == workspace_id)
        # )
        # workspace = result.scalar_one_or_none()
        # if not workspace:
        #     return {
        #         "response_code": 206,
        #         "data": {},
        #         "error_message": "Workspace not found"
        #     }

        # node_dict = {
        #     node.id: {
        #         "id": node.id,
        #         "name": node.name,
        #         "type": node.type,
        #         "parent_id": node.parent_id,
        #         "created_at": node.created_at,
        #     }
        #     for node in workspace.nodes
        # }

        # # ---- Build Tree with Inline Pruning ----
        # def build_tree(node_id: int):
        #     node = node_dict[node_id]
        #     children = [build_tree(cid) for cid in node_dict if node_dict[cid]["parent_id"] == node_id]
        #     children = [c for c in children if c]

        #     if node["type"] == "file":
        #         run_data = results_dict.get(node_id)
        #         if run_data:
        #             return {"file_id": node_id, **run_data}
        #         return None
        #     else:
        #         if children:
        #             return {**node, "children": children}
        #         return None

        # root_nodes = [build_tree(nid) for nid, n in node_dict.items() if n["parent_id"] is None]
        # root_nodes = [n for n in root_nodes if n]

        # return {
        #     "response_code": 200,
        #     "data": {
        #         "created_at": datetime.now(),
        #         "file_tree": root_nodes,
        #         "total_nodes": len(workspace.nodes) if workspace.nodes else 0,
        #     }
        # }

    except Exception as e:
        ExceptionHandler(e)
