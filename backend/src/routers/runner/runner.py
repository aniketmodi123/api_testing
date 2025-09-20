import asyncio
import httpx
import re
import time
from typing import Dict, Any, List
from routers.runner.validator import evaluate_expect


def resolve_variables(data: Any, variables: dict, ts: int | None = None) -> Any:
    if data is None:
        return None
    if not ts:
        ts = int(time.time() * 1000)

    if isinstance(data, str):
        result = str(data)
        if variables:
            def replace_variable(match):
                var_name = match.group(1)
                return str(variables.get(var_name, match.group(0)))
            result = re.sub(r"\{\{([a-zA-Z_][a-zA-Z0-9_\-]*)\}\}", replace_variable, result)
        return result.replace("${ts}", str(ts))

    if isinstance(data, dict):
        return {k: resolve_variables(v, variables, ts) for k, v in data.items()}
    if isinstance(data, list):
        return [resolve_variables(i, variables, ts) for i in data]
    return data


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
                    json=body if method in ("POST", "PUT", "PATCH") else None,
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
