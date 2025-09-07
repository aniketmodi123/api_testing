
# build URL (avoids double slashes)
import asyncio
import httpx
import time
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
import json
import yaml

from validator import evaluate_expect  # your light-mode validator


def resolve_docker_url(url: str) -> str:
    """
    Resolve URL for Docker container networking.
    When running inside Docker, localhost refers to the host machine.
    """
    if 'localhost' in url:
        # Replace localhost with host.docker.internal for Docker networking
        return url.replace('localhost', 'host.docker.internal')

    return url

ROOT = Path(__file__).parent
CONFIG = ROOT / "config.yaml"

# ---------- helper loaders ----------
def _load_yaml(path: Path) -> dict:
    with open(path, "r", encoding="utf-8-sig") as f:
        return yaml.safe_load(f) or {}


def _load_json(path: Path) -> Tuple[dict, List[dict]]:
    with open(path, "r", encoding="utf-8-sig") as f:
        data = json.load(f)

    if not isinstance(data, dict) or "cases" not in data:
        raise ValueError(f"{path} must contain an object with 'meta' and 'cases'")

    meta = data.get("meta", {})
    cases = data.get("cases", [])
    if not isinstance(cases, list):
        raise ValueError(f"{path} -> 'cases' must be a list")

    return meta, cases


def _find_services_boundary(path: Path) -> Path:
    """
    Returns the boundary directory to stop header inheritance at.
    By default this is ROOT/services/<service> if present, else ROOT/services,
    else ROOT as a last resort. Works no matter how deep the JSON lives.
    """
    p = path.resolve()
    parts = p.parts
    try:
        idx = parts.index("services")
        # If there is a service name after "services", stop at services/<service>
        if idx + 1 < len(parts):
            return Path(*parts[: idx + 2])
        return Path(*parts[: idx + 1])  # .../services
    except ValueError:
        return ROOT  # no "services" in path; fall back to repo root


def _load_headers_hierarchy(start_dir: Path, stop_at: Optional[Path] = None) -> dict:
    """
    Walks from start_dir up to and INCLUDING stop_at (default: ROOT), collecting
    headers.yaml files. Parent headers are applied first; child overrides parent.
    Accepts either {"headers": {...}} or a raw map at the file root.
    """
    if stop_at is None:
        stop_at = ROOT

    headers_list: List[Dict[str, str]] = []
    current = start_dir.resolve()
    stop_at = stop_at.resolve()

    while True:
        header_file = current / "headers.yaml"
        if header_file.exists():
            try:
                data = _load_yaml(header_file)
                if isinstance(data, dict):
                    # allow {"headers": {...}} or raw map
                    headers_list.append(data.get("headers", data) or {})
                else:
                    headers_list.append({})
            except Exception:
                headers_list.append({})

        if current == stop_at:
            break
        if current == current.parent:
            break  # safety at filesystem root
        current = current.parent

    merged: Dict[str, str] = {}
    for h in reversed(headers_list):  # parent → child
        merged.update(h)
    return merged


# ---------- API runner ----------
async def _run_case(
    client: httpx.AsyncClient,
    headers: Dict[str, str],
    case: Dict[str, Any],
    ts: int,
    timeout: int,
    sem: asyncio.Semaphore,
) -> Dict[str, Any]:
    try:
        async with sem:
            # Replace ${ts} in all strings recursively
            def replace_ts(val):
                if isinstance(val, str):
                    return val.replace("${ts}", str(ts))
                elif isinstance(val, list):
                    return [replace_ts(v) for v in val]
                elif isinstance(val, dict):
                    return {k: replace_ts(v) for k, v in val.items()}
                return val

            # Apply ${ts} to case first (endpoint/body/etc.)
            replaced_case = replace_ts(case)
            if isinstance(replaced_case, dict):
                case = replaced_case
            else:
                raise TypeError("After replace_ts, case is not a dict as expected")

            # Merge meta defaults into case
            method = (case.get("method") or "GET").upper()
            url = case.get('endpoint', '')

            # Merge headers from global → service → case, then apply ${ts} into headers as well
            merged_headers = {**headers, **case['headers']}

            replaced_headers = replace_ts(merged_headers)
            if not isinstance(replaced_headers, dict):
                replaced_headers = {}
            headers = {str(k): str(v) for k, v in replaced_headers.items()}

            body = case.get("body")
            params = case.get("params")

            print(f"{case['name']} | {method} {url}")

            # Resolve Docker URL for localhost
            resolved_url = resolve_docker_url(url)

            # time the request
            t0 = time.perf_counter()

            # Send request (pass params as query parameters when present)
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

            # -------- Validate expectations (Light Mode) --------
            expect = case.get("expected", {})

            text_contains = expect.get("text_contains")
            text_contains_match = (
                "text_contains" not in expect
                or (isinstance(text_contains, list) and all(s in (resp.text or "") for s in text_contains))
                or (isinstance(text_contains, str) and text_contains in (resp.text or ""))
            )
            json_checks_match = True  # legacy no-op in light mode

            # New validator
            ok, failures = evaluate_expect(resp, expect)

            # -------- Hierarchy & response preview --------

            try:
                resp_json = resp.json()
            except Exception:
                resp_json = None

            # -------- API signature (group same API across files/cases) --------
            raw_endpoint = case.get("endpoint", "") or ""
            path_only = raw_endpoint.split("?", 1)[0] if raw_endpoint else ""

            return {
                "case": case["name"],
                "case_id": case["id"],

                # validation result
                "success": ok,
                "failures": failures,

                # status & timing
                "status_code": resp.status_code,
                "duration_ms": duration_ms,

                # legacy booleans
                "text_contains_match": text_contains_match,
                "json_checks_match": json_checks_match,

                # API info
                "api": {
                    "method": method,
                    "endpoint": raw_endpoint,
                    "path": path_only,
                },

                # request/response snapshots
                "request": {
                    "method": method,
                    "url": url,
                    "headers": case['headers'],
                    "params": params,
                    "body": body,
                    "expected": expect
                },
                "response": {
                    "status_code": resp.status_code,
                    "json": resp_json,
                }
            }
    except Exception as e:
        return {}
# NEW: run cases by pulling spec from your /file/{file_id}/api?include_cases=true endpoint
import httpx, asyncio, time
from typing import Dict, Any, List

async def run_from_list_api(
    data: dict,
    concurrency: int = 5,
) -> Dict[str, Any]:
    try:
        method   = (data.get("method") or "GET").upper()
        endpoint = data.get("endpoint") or "/"
        api_hdrs = data.get("headers") or {}  # already merged in list_api
        extra    = data.get("extra_meta") or {}
        if isinstance(extra, dict) and isinstance(extra.get("headers"), dict):
            api_hdrs = {**api_hdrs, **extra["headers"]}

        # Build runner-style cases: keep 'expected' so _run_case fallback picks it up
        cases = []
        for c in data.get("test_cases", []):
            cases.append({
                "name": c.get("name") or f"case-{c.get('id')}",
                "body": c.get("body"),
                "id": c.get("id"),
                "params": c.get("params"),
                "expected": c.get("expected"),
                "method": method,
                "endpoint": endpoint,
                "headers": c.get("headers"),
            })

        ts = int(time.time() * 1000)
        sem = asyncio.Semaphore(concurrency)
        results: List[Dict[str, Any]] = []

        # Use your existing _run_case with a synthetic service_path
        async with httpx.AsyncClient() as client:
            for case in cases:
                res = await _run_case(
                    client=client,
                    headers=api_hdrs,                 # merged headers from list_api
                    case=case,
                    ts=ts,
                    timeout=200,
                    sem=sem,
                )
                results.append(res)

        # group by API signature for a tidy summary
        by_api: Dict[str, List[Dict[str, Any]]] = {}
        for r in results:
            sig = (r.get("api") or {}).get("signature")
            if not sig:
                continue
            by_api.setdefault(sig, []).append(r)
        for sig, lst in by_api.items():
            lst.sort(key=lambda x: (x.get("ok") is True, x.get("case", "")))

        return {
            "meta": {
                "endpoint": endpoint,
                "method": method,
                "headers": api_hdrs,
                "total_cases": len(cases),
            },
            "by_api": by_api,
            "flat": results
        }
    except Exception as e:
        raise Exception(f"Error running cases for API {data.get('name')}: {str(e)}")