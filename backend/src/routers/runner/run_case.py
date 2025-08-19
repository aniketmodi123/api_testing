# from fastapi import APIRouter, Depends, Header
# from sqlalchemy.ext.asyncio import AsyncSession

# from config import get_db
# from utils import (
#     ExceptionHandler
# )

# router = APIRouter()


# @router.get("/run/case")
# async def get_workspace_with_tree(
#     workspace_id: int,
#     username: str = Header(...),
#     db: AsyncSession = Depends(get_db)
# ):
#     """Get workspace details with file tree structure"""
#     try:
#         return ''

#     except Exception as e:
#         ExceptionHandler(e)





import os
import asyncio
from fs_api import router as fs_router
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

# Swagger at /swagger
app = FastAPI(docs_url="/swagger", redoc_url=None, openapi_url="/openapi.json")

# CORS (open; tighten if needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

ROOT = Path(__file__).parent
SERVICES_DIR = ROOT / "services"

# -------------------- Legacy run endpoints (Postman friendly) --------------------

@app.get("/")
def welcome():
    return "welcome"

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
    """
    Load a test JSON file. If the file is empty or whitespace-only, return a default skeleton.
    If the top-level JSON is a list, wrap it as {"meta": {}, "cases": <list>}.
    Always returns a dict with at least 'meta' and 'cases' keys.
    """
    text = path.read_text(encoding="utf-8-sig")
    if not text.strip():
        return {"meta": {}, "cases": []}
    data = json.loads(text)
    if isinstance(data, list):
        return {"meta": {}, "cases": data}
    if isinstance(data, dict):
        if not isinstance(data.get("meta"), dict):
            data["meta"] = {}
        if not isinstance(data.get("cases"), list):
            data["cases"] = []
        return data
    return {"meta": {}, "cases": []}

def _scan_services_tree() -> Dict[str, Any]:
    """
    Build a tree of folders and files (files have {meta, apis, cases}).
    Unlike the old version, this includes EMPTY folders too.
    """
    tree: Dict[str, Any] = {}
    if not SERVICES_DIR.exists():
        return tree

    for dirpath, dirnames, filenames in os.walk(SERVICES_DIR):
        # make/ensure the folder node exists
        rel_dir = os.path.relpath(dirpath, SERVICES_DIR)
        parts = [] if rel_dir in (".", "") else rel_dir.replace("\\", "/").split("/")

        cur = tree
        for p in parts:
            cur = cur.setdefault(p, {})  # create folder nodes even if empty

        # add JSON files in this directory
        for fname in filenames:
            if not fname.lower().endswith(".json"):
                continue
            if fname.lower() == "headers.json":
                continue

            jf = Path(dirpath) / fname
            rel = jf.relative_to(SERVICES_DIR).as_posix()
            file_parts = parts + [fname]

            doc = _load_json_file(jf)
            meta = doc.get("meta", {}) or {}
            cases = doc.get("cases", []) or []

            # discover API signatures
            def _path_only(url: str) -> str:
                return (url or "").split("?", 1)[0]

            method = (meta.get("method") or "GET").upper()
            endpoint = meta.get("endpoint") or ""
            apis = set()
            if _path_only(endpoint):
                apis.add(f"{method} {_path_only(endpoint)}")
            for c in cases:
                if isinstance(c, dict):
                    m = (c.get("method") or method).upper()
                    e = c.get("endpoint", endpoint) or ""
                    ponly = _path_only(e)
                    if ponly:
                        apis.add(f"{m} {ponly}")

            cur[fname] = {
                "meta": {
                    "service": rel,
                    "service_parts": file_parts,
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
        for _, v in node.items():
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
    acc: List[str] = []
    def gather(n):
        for _, v in n.items():
            if isinstance(v, dict) and "meta" in v and "cases" in v:
                acc.append(v["meta"]["service"])
            elif isinstance(v, dict):
                gather(v)
    gather(node)
    return acc

# -------------------- Request models --------------------

class RunFilter(BaseModel):
    scope: str  # "project" | "folder" | "file" | "api" | "case"
    folder_parts: Optional[List[str]] = None      # for scope="folder"
    file_service: Optional[str] = None            # for scope="file"
    api_signatures: Optional[List[str]] = None    # for scope="api" (e.g., ["GET /cis/tariff"])
    case_file: Optional[str] = None               # for scope="case"
    case_names: Optional[List[str]] = None        # for scope="case"

class RunRequest(BaseModel):
    filters: List[RunFilter]
    concurrency: int = 1   # outer concurrency: number of cases to run in parallel

# -------------------- Selective execution helpers --------------------

def _case_names_for_file(file_rel: str) -> List[str]:
    """Return list of case names defined in a file like 'cis/tariff/get_tariff.json'."""
    jf = (SERVICES_DIR / file_rel)
    try:
        doc = _load_json_file(jf)
    except Exception:
        return []
    names: List[str] = []
    for c in (doc.get("cases") or []):
        if isinstance(c, dict):
            nm = c.get("name")
            if isinstance(nm, str):
                names.append(nm)
    return names

def _path_only(endpoint: str) -> str:
    return (endpoint or "").split("?", 1)[0]

def _api_signature(method: str, endpoint: str) -> str:
    m = (method or "GET").upper()
    p = _path_only(endpoint)
    return f"{m} {p}" if p else m

def _cases_for_api_signatures(files: List[str], sigs: set[str]) -> Dict[str, List[str]]:
    """
    For each file path like 'cis/tariff/get_tariff.json', return the case names
    whose method+path signature is in `sigs`.
    """
    out: Dict[str, List[str]] = {}
    for file_rel in files:
        jf = (SERVICES_DIR / file_rel)
        try:
            doc = _load_json_file(jf)
        except Exception:
            continue

        meta = doc.get("meta", {}) or {}
        default_m = (meta.get("method") or "GET").upper()
        default_e = meta.get("endpoint") or ""

        selected: List[str] = []
        for c in (doc.get("cases") or []):
            if not isinstance(c, dict):
                continue
            m = (c.get("method") or default_m).upper()
            e = c.get("endpoint", default_e) or ""
            sig = _api_signature(m, e)
            if sig in sigs:
                nm = c.get("name")
                if isinstance(nm, str):
                    selected.append(nm)
        if selected:
            out[file_rel] = selected
    return out

def _summarize(merged: Dict[str, Any]) -> None:
    total = len(merged.get("flat", []))
    passed = sum(1 for r in merged.get("flat", []) if r.get("ok"))
    failed = total - passed
    merged["summary"] = {
        "total": total, "passed": passed, "failed": failed,
        "pass_rate": round((passed/total*100.0), 2) if total else 0.0
    }

# -------------------- Concurrency helpers --------------------

async def _exec_case(svc: str, file_rel: str, cname: str, inner_conc: int) -> List[dict]:
    """
    Run one case and keep only that file+case from the result.
    NOTE: we pass inner_conc=1 to avoid multiplying parallelism; the outer semaphore controls it.
    """
    res = await run_tests(service=svc, case_name=cname, concurrency=inner_conc)
    return [r for r in res["flat"] if r.get("service") == file_rel and r.get("case") == cname]

def _merge_flat(flat: List[dict]) -> Dict[str, Any]:
    merged = {"by_folder": {}, "by_api": {}, "flat": []}
    for r in flat:
        parts = r["service_parts"]
        # by_folder
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
        # by_api
        if sig:
            merged["by_api"].setdefault(sig, []).append(r)
        # flat
        merged["flat"].append(r)
    return merged

# -------------------- Runners (parallel per case) --------------------

async def _run_for_files(files: List[str], concurrency: int) -> Dict[str, Any]:
    """
    Run only the cases that belong to the given files.
    Executes cases in parallel, bounded by `concurrency`.
    """
    targets: List[tuple[str, str, str]] = []
    for file_rel in files:
        svc = file_rel.split("/", 1)[0]
        for cname in _case_names_for_file(file_rel):
            targets.append((svc, file_rel, cname))

    if not targets:
        return {"by_folder": {}, "by_api": {}, "flat": []}

    sem = asyncio.Semaphore(max(1, concurrency))

    async def run_one(t: tuple[str, str, str]) -> List[dict]:
        svc, file_rel, cname = t
        async with sem:
            return await _exec_case(svc, file_rel, cname, inner_conc=1)

    batches = await asyncio.gather(*[run_one(t) for t in targets])
    flat = [r for batch in batches for r in batch]
    return _merge_flat(flat)

async def _run_for_cases_selected(cases_by_file: Dict[str, List[str]], concurrency: int) -> Dict[str, Any]:
    """
    Run ONLY specified case names per file.
    Executes cases in parallel, bounded by `concurrency`.
    """
    targets: List[tuple[str, str, str]] = []
    for file_rel, names in cases_by_file.items():
        svc = file_rel.split("/", 1)[0]
        for cname in names:
            targets.append((svc, file_rel, cname))

    if not targets:
        return {"by_folder": {}, "by_api": {}, "flat": []}

    sem = asyncio.Semaphore(max(1, concurrency))

    async def run_one(t: tuple[str, str, str]) -> List[dict]:
        svc, file_rel, cname = t
        async with sem:
            return await _exec_case(svc, file_rel, cname, inner_conc=1)

    batches = await asyncio.gather(*[run_one(t) for t in targets])
    flat = [r for batch in batches for r in batch]
    return _merge_flat(flat)

