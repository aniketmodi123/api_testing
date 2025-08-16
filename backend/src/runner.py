import asyncio
import httpx
import time
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
import json
import yaml

from validator import evaluate_expect  # your light-mode validator

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
    base_url: str,
    global_headers: Dict[str, str],
    svc_headers: Dict[str, str],
    service_path: str,
    case: Dict[str, Any],
    ts: int,
    timeout: int,
    sem: asyncio.Semaphore,
) -> Dict[str, Any]:
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
        case = replace_ts(case)

        # Merge meta defaults into case
        method = (case.get("method") or "GET").upper()
        url = f"{base_url}{case.get('endpoint', '')}"

        # Merge headers from global → service → case, then apply ${ts} into headers as well
        headers = {**global_headers, **svc_headers, **case.get("headers", {})}
        headers = replace_ts(headers)

        body = case.get("body")

        print(f"[RUN] {service_path} | {case['name']} | {method} {url}")

        # time the request
        t0 = time.perf_counter()

        # Send request
        if method == "GET":
            resp = await client.get(url, headers=headers, timeout=timeout)
        elif method == "POST":
            resp = await client.post(url, headers=headers, json=body, timeout=timeout)
        elif method == "PUT":
            resp = await client.put(url, headers=headers, json=body, timeout=timeout)
        elif method == "DELETE":
            resp = await client.delete(url, headers=headers, timeout=timeout)
        elif method == "PATCH":
            resp = await client.patch(url, headers=headers, json=body, timeout=timeout)
        elif method == "HEAD":
            resp = await client.head(url, headers=headers, timeout=timeout)
        elif method == "OPTIONS":
            resp = await client.options(url, headers=headers, timeout=timeout)
        else:
            raise ValueError(f"Unsupported method: {method}")

        duration_ms = round((time.perf_counter() - t0) * 1000, 2)

        # -------- Validate expectations (Light Mode) --------
        expect = case.get("expect", {})

        # Back-compat metrics (keep them for any legacy dashboards)
        status_match = resp.status_code == expect.get("status", resp.status_code)
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
        node_path = service_path.lstrip("/")
        service_parts = [p for p in node_path.split("/") if p]

        try:
            resp_json = resp.json()
        except Exception:
            resp_json = None

        # -------- API signature (group same API across files/cases) --------
        raw_endpoint = case.get("endpoint", "") or ""
        path_only = raw_endpoint.split("?", 1)[0] if raw_endpoint else ""
        api_signature = f"{method} {path_only}" if path_only else method

        return {
            # hierarchy + identity
            "service": service_path,                # e.g., "cis/tariff/create_tariff.json"
            "node_path": node_path,                 # normalized path (no leading slash)
            "service_parts": service_parts,         # ["cis","tariff","create_tariff.json"]
            "case": case["name"],

            # validation result
            "ok": ok,
            "failures": failures,

            # status & timing
            "status_code": resp.status_code,
            "duration_ms": duration_ms,

            # legacy booleans
            "status_match": status_match,
            "text_contains_match": text_contains_match,
            "json_checks_match": json_checks_match,

            # API info
            "api": {
                "method": method,
                "endpoint": raw_endpoint,   # e.g. "/cis/tariff?id=1"
                "path": path_only,          # e.g. "/cis/tariff"
                "signature": api_signature  # e.g. "GET /cis/tariff"
            },

            # request/response snapshots
            "request": {
                "method": method,
                "url": url,
                "headers": headers,
                "body": body
            },
            "response": {
                "status_code": resp.status_code,
                "json": resp_json,
            }
        }


# ---------- main runner ----------
async def run_tests(
    service: Optional[str] = None,
    case_name: Optional[str] = None,
    concurrency: int = 1
) -> Dict[str, Any]:
    """
    Run tests by discovering JSON files under services/ at any depth.

    Args:
        service: Optional subtree under services/ to restrict discovery.
                 Examples: "cis", "cis/tariff/v2"
        case_name: If provided, only run the case with this exact name from each file.
        concurrency: Max number of in-flight requests.

    Returns:
        Dict with "by_folder", "by_api", and "flat" result views.
    """
    cfg = _load_yaml(CONFIG)
    base_url = cfg.get("base_url", "")
    global_headers = cfg.get("default_headers", {})
    timeout = cfg.get("timeout", 10)

    services_root = ROOT / "services"
    search_root = (services_root / service) if service else services_root
    ts = int(time.time() * 1000)

    sem = asyncio.Semaphore(concurrency)
    tasks: List[asyncio.Task] = []

    async with httpx.AsyncClient() as client:
        for json_file in search_root.rglob("*.json"):
            if json_file.name.lower() == "headers.json":
                continue

            # Build header inheritance chain up to a sensible boundary
            boundary = _find_services_boundary(json_file.parent)
            svc_headers = _load_headers_hierarchy(json_file.parent, stop_at=boundary)

            meta, cases = _load_json(json_file)
            for case in cases:
                if case_name and case.get("name") != case_name:
                    continue

                merged_case = {**meta, **case}

                # For grouping, keep the path relative to services/
                try:
                    relative_from_services = json_file.relative_to(services_root)
                    service_path = str(relative_from_services).replace("\\", "/")
                except ValueError:
                    # If JSON not under services/ (edge case), fall back to project-relative
                    service_path = str(json_file.relative_to(ROOT)).replace("\\", "/")

                tasks.append(
                    _run_case(
                        client,
                        base_url,
                        global_headers,
                        svc_headers,
                        service_path,
                        merged_case,
                        ts,
                        timeout,
                        sem,
                    )
                )

        # ✅ Await here, while the client is still open
        results: List[Dict[str, Any]] = await asyncio.gather(*tasks) if tasks else []

    # ---- Group into folder-like hierarchy (with common meta per file) ----
    by_folder: Dict[str, Any] = {}
    for r in results:
        parts = r["service_parts"]  # ["cis","tariff","create_tariff.json"]
        current = by_folder
        for p in parts[:-1]:  # folders
            current = current.setdefault(p, {})
        file_name = parts[-1]

        file_node = current.setdefault(file_name, {
            "meta": {
                "service": r["service"],
                "node_path": r["node_path"],
                "service_parts": r["service_parts"],
                "apis": []
            },
            "cases": []
        })

        sig = (r.get("api") or {}).get("signature")
        if sig and sig not in file_node["meta"]["apis"]:
            file_node["meta"]["apis"].append(sig)

        file_node["cases"].append({
            "case": r["case"],
            "ok": r["ok"],
            "failures": r["failures"],
            "status_code": r["status_code"],
            "duration_ms": r.get("duration_ms"),
            "api": r.get("api"),
            "request": r.get("request"),
            "response": r.get("response"),
            "status_match": r.get("status_match"),
            "text_contains_match": r.get("text_contains_match"),
            "json_checks_match": r.get("json_checks_match"),
        })

    # ---- Group by API signature (method + path) ----
    by_api: Dict[str, List[Dict[str, Any]]] = {}
    for r in results:
        sig = (r.get("api") or {}).get("signature")
        if not sig:
            continue
        by_api.setdefault(sig, []).append(r)

    # ---- Sort cases (failures first, then name) ----
    def _sort_inplace(node):
        if isinstance(node, dict):
            for k, v in node.items():
                if k == "cases" and isinstance(v, list):
                    v.sort(key=lambda x: (x.get("ok") is True, x.get("case", "")))
                else:
                    _sort_inplace(v)

    _sort_inplace(by_folder)
    for sig, lst in by_api.items():
        lst.sort(key=lambda x: (x.get("ok") is True, x.get("case", "")))

    return {
        "by_folder": by_folder,
        "by_api": by_api,
        "flat": results
    }
