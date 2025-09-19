import asyncio
import re
import httpx
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

        # Replace {{var}} patterns
        if variables:
            def replace_variable(match):
                var_name = match.group(1)
                return str(variables.get(var_name, match.group(0)))
            pattern = r'\{\{([a-zA-Z_][a-zA-Z0-9_\-]*)\}\}'
            result = re.sub(pattern, replace_variable, result)

        # Replace ${ts}
        if ts is not None:
            result = result.replace("${ts}", str(ts))

        return result

    if isinstance(data, dict):
        return {k: resolve_variables(v, variables, ts) for k, v in data.items()}

    if isinstance(data, list):
        return [resolve_variables(item, variables, ts) for item in data]

    return data



def resolve_docker_url(url: str) -> str:
    """Replace localhost with host.docker.internal for Docker networking inside Docker."""
    if "localhost" in url:
        return url.replace("localhost", "host.docker.internal")
    return url


async def _run_case(
    client: httpx.AsyncClient,
    headers: Dict[str, str],
    case: Dict[str, Any],
    timeout: int,
    sem: asyncio.Semaphore,
) -> Dict[str, Any]:
    try:
        async with sem:

            method = (case.get("method") or "GET").upper()
            url = case.get("endpoint", "")

            merged_headers = {**headers, **case["headers"]}

            if not isinstance(merged_headers, dict):
                merged_headers = {}
            headers = {str(k): str(v) for k, v in merged_headers.items()}

            body = case.get("body")
            params = case.get("params")

            print(f"{case['name']} | {method} {url}")

            resolved_url = resolve_docker_url(url)

            t0 = time.perf_counter()

            if method == "GET":
                resp = await client.get(resolved_url, headers=headers, params=params, timeout=timeout)
            elif method == "POST":
                resp = await client.post(resolved_url, headers=headers, json=body, params=params, timeout=timeout)
            elif method == "PUT":
                resp = await client.put(resolved_url, headers=headers, json=body, params=params, timeout=timeout)
            elif method == "DELETE":
                resp = await client.delete(resolved_url, headers=headers, params=params, timeout=timeout)
            elif method == "PATCH":
                resp = await client.patch(resolved_url, headers=headers, json=body, params=params, timeout=timeout)
            elif method == "HEAD":
                resp = await client.head(resolved_url, headers=headers, params=params, timeout=timeout)
            elif method == "OPTIONS":
                resp = await client.options(resolved_url, headers=headers, params=params, timeout=timeout)
            else:
                raise ValueError(f"Unsupported method: {method}")

            duration_ms = round((time.perf_counter() - t0) * 1000, 2)

            expect = case.get("expected", {})
            ok, failures = evaluate_expect(resp, expect)

            try:
                resp_json = resp.json()
            except Exception:
                resp_json = None

            raw_endpoint = case.get("endpoint", "") or ""
            path_only = raw_endpoint.split("?", 1)[0] if raw_endpoint else ""

            return {
                "case": case["name"],
                "case_id": case["id"],
                "success": ok,
                "failures": failures,
                "status_code": resp.status_code,
                "duration_ms": duration_ms,
                "api": {"method": method, "endpoint": raw_endpoint, "path": path_only},
                "request": {
                    "method": method,
                    "url": url,
                    "headers": case["headers"],
                    "params": params,
                    "body": body,
                    "expected": expect,
                },
                "response": {"status_code": resp.status_code, "json": resp_json},
            }
    except Exception:
        return {}


# ---------- Run from API definition (list of cases) ----------
async def run_from_list_api(data: dict, concurrency: int = 5) -> Dict[str, Any]:
    try:
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
            resolved_case = {
                "name": c.get("name") or f"case-{c.get('id')}",
                "id": c.get("id"),
                "method": method,
                "endpoint": resolve_variables(c.get("endpoint") or endpoint, workspace_variables, ts),
                "headers": resolve_variables(c.get("headers", {}), workspace_variables, ts),
                "params": resolve_variables(c.get("params", {}), workspace_variables, ts),
                "body": resolve_variables(c.get("body", {}), workspace_variables, ts),
                "expected": resolve_variables(c.get("expected", {}), workspace_variables, ts),
            }
            cases.append(resolved_case)

        ts = int(time.time() * 1000)
        sem = asyncio.Semaphore(concurrency)
        results: List[Dict[str, Any]] = []

        async with httpx.AsyncClient() as client:
            for case in cases:
                res = await _run_case(client, headers=api_hdrs, case=case, timeout=200, sem=sem)
                results.append(res)

        return {
            "meta": {
                "endpoint": endpoint,
                "method": method,
                "headers": api_hdrs,
                "total_cases": len(cases),
            },
            "flat": results,
        }
    except Exception as e:
        raise Exception(f"Error running cases for API {data.get('name')}: {str(e)}")
