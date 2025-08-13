import asyncio
import httpx
import time
from pathlib import Path
from typing import Optional, Dict, Any, List
import json
import yaml

from validator import evaluate_expect  # your light-mode validator

ROOT = Path(__file__).parent
CONFIG = ROOT / "config.yaml"

# ---------- helper loaders ----------
def _load_yaml(path: Path) -> dict:
    with open(path, "r", encoding="utf-8-sig") as f:
        return yaml.safe_load(f) or {}

def _load_json(path: Path):
    with open(path, "r", encoding="utf-8-sig") as f:
        data = json.load(f)

    if not isinstance(data, dict) or "cases" not in data:
        raise ValueError(f"{path} must contain an object with 'meta' and 'cases'")

    meta = data.get("meta", {})
    cases = data.get("cases", [])
    if not isinstance(cases, list):
        raise ValueError(f"{path} -> 'cases' must be a list")

    return meta, cases

def _load_headers_hierarchy(start_dir: Path) -> dict:
    """
    Loads headers.yaml files from the given directory up to ROOT/services/<service>.
    Merges them so parent headers are overridden by child headers.
    """
    headers_list = []
    current_dir = start_dir

    while True:
        header_file = current_dir / "headers.yaml"
        if header_file.exists():
            try:
                headers_list.append(_load_yaml(header_file).get("headers", {}))
            except Exception:
                headers_list.append({})

        # Stop at repo root or services root
        if current_dir == ROOT or current_dir.parent == ROOT:
            break

        current_dir = current_dir.parent

    merged = {}
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

        case = replace_ts(case)

        # Merge meta defaults into case
        method = (case.get("method") or "GET").upper()
        url = f"{base_url}{case.get('endpoint', '')}"
        headers = {**global_headers, **svc_headers, **case.get("headers", {})}
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
        else:
            raise ValueError(f"Unsupported method: {method}")

        duration_ms = round((time.perf_counter() - t0) * 1000, 2)

        # -------- Validate expectations (Light Mode) --------
        expect = case.get("expect", {})

        # Back-compat metrics (keep them for any legacy dashboards)
        status_match = resp.status_code == expect.get("status", resp.status_code)
        text_contains = expect.get("text_contains")
        text_contains_match = (
            "text_contains" not in expect or
            (isinstance(text_contains, list) and all(s in (resp.text or "") for s in text_contains)) or
            (isinstance(text_contains, str) and text_contains in (resp.text or ""))
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
async def run_tests(service: Optional[str] = None, case_name: Optional[str] = None, concurrency: int = 1) -> Dict[str, Any]:
    cfg = _load_yaml(CONFIG)
    base_url = cfg.get("base_url", "")
    global_headers = cfg.get("default_headers", {})
    timeout = cfg.get("timeout", 10)

    services = [service] if service else [
        p.name for p in (ROOT / "services").iterdir() if p.is_dir()
    ]
    ts = int(time.time() * 1000)

    sem = asyncio.Semaphore(concurrency)
    tasks: List[asyncio.Task] = []

    # IMPORTANT: build tasks AND await them before leaving the context
    async with httpx.AsyncClient() as client:
        for srv in services:
            srv_dir = ROOT / "services" / srv
            for json_file in srv_dir.rglob("*.json"):
                if json_file.name.lower() == "headers.json":
                    continue

                svc_headers = _load_headers_hierarchy(json_file.parent)
                meta, cases = _load_json(json_file)

                for case in cases:
                    if case_name and case.get("name") != case_name:
                        continue

                    merged_case = {**meta, **case}
                    tasks.append(
                        _run_case(
                            client,
                            base_url,
                            global_headers,
                            svc_headers,
                            f"{srv}/{json_file.relative_to(srv_dir)}",
                            merged_case,
                            ts,
                            timeout,
                            sem,
                        )
                    )

        # ✅ Await here, while the client is still open
        results: List[Dict[str, Any]] = await asyncio.gather(*tasks) if tasks else []

    # ... keep your existing grouping (by_folder/by_api/flat) that uses `results`
    # (no other changes needed)


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
                    v.sort(key=lambda x: (x.get("ok") is True, x.get("case","")))
                else:
                    _sort_inplace(v)

    _sort_inplace(by_folder)
    for sig, lst in by_api.items():
        lst.sort(key=lambda x: (x.get("ok") is True, x.get("case","")))

    return {
        "by_folder": by_folder,
        "by_api": by_api,
        "flat": results
    }
