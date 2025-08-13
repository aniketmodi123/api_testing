from pathlib import Path
from typing import Dict, Any, List, Optional
import pytz
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from runner import CONFIG, _load_yaml, run_tests
import json

FASTAPI_CONFIG = {
    'title': 'Testing server',
    'version': '1.0',
    'tzinfo': pytz.timezone('Asia/Kolkata')
}

app = FastAPI(title=FASTAPI_CONFIG['title'], version=FASTAPI_CONFIG['version'])

# CORS (open; tighten if needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

ROOT = Path(__file__).parent
SERVICES_DIR = ROOT / "services"

# -------------------- Legacy run endpoints (Postman friendly) --------------------

@app.get("/config")
def get_config():
    return _load_yaml(CONFIG)

@app.get("/run")
async def run_all():
    results = await run_tests()
    return results["flat"]

@app.get("/run/{service}")
async def run_service(service: str):
    """
    Run a single top-level service folder; returns FLAT list (legacy).
    """
    results = await run_tests(service=service)
    # filter to only that service (flat list already only contains it, but keep explicit)
    flat = [r for r in results["flat"] if r.get("service", "").startswith(f"{service}/")]
    return flat

@app.get("/run/{service}/{case}")
async def run_case(service: str, case: str):
    """
    Run a single case by exact name under a top-level service; returns FLAT list.
    """
    results = await run_tests(service=service, case_name=case)
    flat = [r for r in results["flat"] if r.get("service", "").startswith(f"{service}/") and r.get("case") == case]
    return flat

# -------------------- Introspection for UI --------------------

def _load_json_file(path: Path) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8-sig") as f:
        return json.load(f)

def _scan_services_tree() -> Dict[str, Any]:
    """
    Builds a tree:
    {
      "cis": {
        "tariff": {
          "create_tariff.json": {
            "meta": { "service": "cis/tariff/create_tariff.json", "service_parts": ["cis","tariff","create_tariff.json"] },
            "apis": ["POST /cis/tariff", ...],
            "cases": ["A", "B", ...]
          },
          "get_tariff.json": {...}
        }
      }
    }
    """
    tree: Dict[str, Any] = {}
    for jf in SERVICES_DIR.rglob("*.json"):
        if jf.name.lower() == "headers.json":
            continue
        rel = jf.relative_to(SERVICES_DIR).as_posix()
        parts = rel.split("/")
        cur = tree
        for p in parts[:-1]:
            cur = cur.setdefault(p, {})
        fname = parts[-1]
        doc = _load_json_file(jf)
        meta = doc.get("meta", {})
        cases = doc.get("cases", [])

        # discover API signatures
        method = (meta.get("method") or "GET").upper()
        endpoint = meta.get("endpoint") or ""
        path_only = endpoint.split("?", 1)[0] if endpoint else ""
        apis = set()
        if path_only:
            apis.add(f"{method} {path_only}")
        # also peek at case-specific overrides
        for c in cases:
            m = (c.get("method") or method).upper()
            e = c.get("endpoint", endpoint) or ""
            po = e.split("?", 1)[0] if e else ""
            if po:
                apis.add(f"{m} {po}")

        cur[fname] = {
            "meta": {
                "service": rel,
                "service_parts": parts,
            },
            "apis": sorted(apis),
            "cases": [c.get("name") for c in cases if isinstance(c, dict) and "name" in c],
        }
    return tree

def _flatten_tree(tree: Dict[str, Any]) -> List[str]:
    """Return all file service paths, e.g. 'cis/tariff/create_tariff.json'."""
    acc: List[str] = []
    def walk(node):
        if not isinstance(node, dict):
            return
        for k, v in node.items():
            if isinstance(v, dict) and "meta" in v and "cases" in v:
                acc.append(v["meta"]["service"])
            elif isinstance(v, dict):
                walk(v)
    walk(tree)
    return acc

def _select_files_from_folder(tree: Dict[str, Any], parts: List[str]) -> List[str]:
    """Return all file paths under a folder path parts (e.g., ['cis','tariff'])."""
    node = tree
    for p in parts:
        if p not in node or not isinstance(node[p], dict):
            return []
        node = node[p]
    acc = []
    def gather(n):
        for k, v in n.items():
            if isinstance(v, dict) and "meta" in v and "cases" in v:
                acc.append(v["meta"]["service"])
            elif isinstance(v, dict):
                gather(v)
    gather(node)
    return acc

# -------------------- Run filters for UI --------------------

class RunFilter(BaseModel):
    scope: str  # "project" | "folder" | "file" | "api" | "case"
    folder_parts: Optional[List[str]] = None      # for scope="folder"
    file_service: Optional[str] = None            # for scope="file"
    api_signatures: Optional[List[str]] = None    # for scope="api"
    case_file: Optional[str] = None               # for scope="case"
    case_names: Optional[List[str]] = None        # for scope="case"

class RunRequest(BaseModel):
    filters: List[RunFilter]
    concurrency: int = 4

async def _run_for_files(files: List[str], concurrency: int) -> Dict[str, Any]:
    """
    Run limited to a set of files. We run per top-level service and filter from flat.
    """
    merged = {"by_folder": {}, "by_api": {}, "flat": []}
    services = sorted(set(f.split("/", 1)[0] for f in files))
    for svc in services:
        res = await run_tests(service=svc, concurrency=concurrency)
        # keep only those files under this service
        keep = [r for r in res["flat"] if r.get("service") in files]
        if not keep:
            continue

        # rebuild per-file compact view
        for r in keep:
            parts = r["service_parts"]
            cur = merged["by_folder"]
            for p in parts[:-1]:
                cur = cur.setdefault(p, {})
            file_node = cur.setdefault(parts[-1], {
                "meta": {
                    "service": r["service"],
                    "node_path": r["node_path"],
                    "service_parts": parts,
                    "apis": []
                },
                "cases": []
            })
            sig = (r.get("api") or {}).get("signature")
            if sig and sig not in file_node["meta"]["apis"]:
                file_node["meta"]["apis"].append(sig)
            file_node["cases"].append({
                "case": r["case"], "ok": r["ok"], "failures": r["failures"],
                "status_code": r["status_code"], "duration_ms": r.get("duration_ms"),
                "api": r.get("api"), "request": r.get("request"), "response": r.get("response"),
            })
            merged["flat"].append(r)

        # by_api
        for r in keep:
            sig = (r.get("api") or {}).get("signature")
            if not sig:
                continue
            merged["by_api"].setdefault(sig, []).append(r)

    return merged

@app.get("/api/tree")
async def api_tree():
    """Return full folder tree with files, APIs, and case names (no runs)."""
    return {"tree": _scan_services_tree()}

@app.post("/api/run")
async def api_run(req: RunRequest):
    """
    Run tests by selection:
      - scope="project"               -> all files
      - scope="folder", folder_parts  -> under this folder
      - scope="file", file_service    -> this file
      - scope="api", api_signatures   -> all cases matching these API signatures
      - scope="case", case_file+case_names -> selected case names in a file
    Returns grouped results and a summary.
    """
    tree = _scan_services_tree()
    file_targets: List[str] = []

    for f in req.filters:
        if f.scope == "project":
            file_targets.extend(_flatten_tree(tree))
        elif f.scope == "folder":
            if not f.folder_parts:
                raise HTTPException(400, "folder_parts required for scope=folder")
            file_targets.extend(_select_files_from_folder(tree, f.folder_parts))
        elif f.scope == "file":
            if not f.file_service:
                raise HTTPException(400, "file_service required for scope=file")
            file_targets.append(f.file_service)
        elif f.scope == "api":
            if not f.api_signatures:
                raise HTTPException(400, "api_signatures required for scope=api")
            # gather all files containing any requested signature
            def gather_files_with_sig(node):
                out = []
                for k, v in node.items():
                    if isinstance(v, dict) and "meta" in v and "cases" in v:
                        apis = set(v.get("apis") or [])
                        if apis.intersection(set(f.api_signatures)):
                            out.append(v["meta"]["service"])
                    elif isinstance(v, dict):
                        out.extend(gather_files_with_sig(v))
                return out
            file_targets.extend(gather_files_with_sig(tree))
        elif f.scope == "case":
            if not f.case_file or not f.case_names:
                raise HTTPException(400, "case_file and case_names required for scope=case")
            file_targets.append(f.case_file)
        else:
            raise HTTPException(400, f"unknown scope: {f.scope}")

    file_targets = sorted(set(file_targets))  # de-dup
    merged = await _run_for_files(file_targets, req.concurrency)

    # If scope=case, post-filter the cases to only requested names
    for f in req.filters:
        if f.scope == "case":
            wanted = set(f.case_names or [])
            parts = f.case_file.split("/")
            node = merged["by_folder"]
            for p in parts[:-1]:
                node = node.get(p, {})
            file_node = node.get(parts[-1])
            if file_node and "cases" in file_node:
                file_node["cases"] = [c for c in file_node["cases"] if c["case"] in wanted]
            merged["flat"] = [r for r in merged["flat"] if r.get("service") != f.case_file or r.get("case") in wanted]
            for sig, lst in list(merged["by_api"].items()):
                merged["by_api"][sig] = [r for r in lst if not (r.get("service")==f.case_file and r.get("case") not in wanted)]

    # cumulative summary
    total = len(merged["flat"])
    passed = sum(1 for r in merged["flat"] if r.get("ok"))
    failed = total - passed
    merged["summary"] = {
        "total": total, "passed": passed, "failed": failed,
        "pass_rate": round((passed/total*100.0), 2) if total else 0.0
    }

    return merged
