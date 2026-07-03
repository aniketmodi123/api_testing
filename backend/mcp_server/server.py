"""
What this file does: Stdio MCP server exposing the API-testing platform as agent tools —
discovery, bulk project sync, environment variables, test runs with reconcile hints, and
result export. Requires env vars PLATFORM_BASE_URL, PLATFORM_EMAIL, PLATFORM_PASSWORD.
"""

from pathlib import Path
from typing import Any, Dict, List, Optional

from mcp.server.fastmcp import FastMCP

try:
    from .platform_client import client, PlatformError
except ImportError:  # allows `python server.py` directly, not just `python -m mcp_server`
    from platform_client import client, PlatformError

# Volatile source-of-truth files, resolved relative to this file so cwd never matters.
# Editing either file updates every connected client on its next fetch — no server restart,
# no per-user skill. This is why the pipeline ships INSIDE the server, not as a local skill.
_SERVER_DIR = Path(__file__).resolve().parent           # backend/mcp_server
_BACKEND_DIR = _SERVER_DIR.parent                       # backend
_REPO_DIR = _BACKEND_DIR.parent                         # api_testing
CASEGEN_PROMPT_PATH = _BACKEND_DIR / "gpt_test_case_creatio_prompt.txt"
TEST_WORKFLOW_PATH = _REPO_DIR / "research" / "mcp" / "TEST_WORKFLOW.md"

_SERVER_INSTRUCTIONS = (
    "ApiPilot test-automation server. To run the full test pipeline for a project's APIs, load the "
    "`test_pipeline` prompt — it returns the current end-to-end workflow (generate cases, mirror the "
    "folder tree, fill variables, run, judge expected-vs-response, export). The workflow and the "
    "case-generation prompt are served live as resources (`workflow://test-pipeline`, "
    "`prompt://case-generation`) and always reflect the latest edited version."
)

mcp = FastMCP("apipilot", instructions=_SERVER_INSTRUCTIONS)


def _read_source_file(path: Path, label: str) -> str:
    """What it does: Return a volatile source file's current text, or a clear placeholder if absent."""
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return f"[{label} not found at {path} — restore it in the repo to enable the pipeline.]"
    except OSError as exc:
        return f"[{label} could not be read from {path}: {exc}]"

VALID_NODE_TYPES = {"folder", "file"}
INVALID_NAME_CHARS = ['<', '>', ':', '"', '/', '\\', '|', '?', '*']
DUPLICATE_MARKERS = ("exist", "duplicate")


# ---------- helpers ----------

def _validate_node_name(name: str) -> None:
    """What it does: Enforce the platform's node-name rules before spending a round-trip."""
    if not name or not name.strip() or len(name) > 255:
        raise ValueError(f"Node name must be 1-255 non-empty characters, got: {name!r}")
    for char in INVALID_NAME_CHARS:
        if char in name:
            raise ValueError(f"Node name cannot contain {char!r}: {name!r}")


def _is_duplicate_error(err: PlatformError) -> bool:
    """What it does: Detect the platform's duplicate-name rejection so re-runs count as success."""
    msg = (err.error_message or "").lower()
    return any(marker in msg for marker in DUPLICATE_MARKERS)


def _iter_tree_nodes(tree: Any, parent_id: Optional[int] = None):
    """What it does: Yield (node_dict, parent_id) pairs from any nested tree/list structure."""
    if isinstance(tree, dict):
        if "name" in tree and "type" in tree:
            yield tree, parent_id
            own_id = tree.get("id")
            for child in tree.get("children") or []:
                yield from _iter_tree_nodes(child, own_id)
        else:
            for value in tree.values():
                yield from _iter_tree_nodes(value, parent_id)
    elif isinstance(tree, list):
        for item in tree:
            yield from _iter_tree_nodes(item, parent_id)


def _find_node_in_tree(
    tree: Any, name: str, node_type: str, parent_id: Optional[int]
) -> Optional[Dict[str, Any]]:
    """What it does: Locate a node by name+type under a specific parent (None = any/root)."""
    for node, node_parent in _iter_tree_nodes(tree):
        if node.get("name") == name and node.get("type") == node_type:
            if parent_id is None or node_parent == parent_id or node.get("parent_id") == parent_id:
                return node
    return None


def _reconcile_case(result: Dict[str, Any]) -> Dict[str, Any]:
    """What it does: Classify one failed case as target-API-bug vs expected-block-bug vs connectivity."""
    if result.get("success"):
        return {"case_id": result.get("case_id"), "case": result.get("case"), "verdict": "pass"}
    failures = result.get("failures") or []
    status = result.get("status_code")
    if status is None:
        hint = (
            "connectivity: request never completed (timeout/network) — "
            "check base URL / target availability, not a case bug"
        )
    elif any("status" in str(f).lower() for f in failures):
        hint = (
            f"target-api-bug?: HTTP status mismatch (target returned {status}) — "
            "verify the target endpoint's behavior before editing the expected block"
        )
    else:
        hint = (
            "ambiguous: status matched but a body assertion failed — compare the response "
            "snippet against the expected block and decide: (a) target API bug or "
            "(b) expected-block bug. Do not silently pass."
        )
    return {
        "case_id": result.get("case_id"),
        "case": result.get("case"),
        "verdict": "fail",
        "failures": failures,
        "status_code": status,
        "hint": hint,
        "response": result.get("response"),
    }


def _collect_case_results(data: Any, out: List[Dict[str, Any]]) -> None:
    """What it does: Recursively collect per-case result dicts (marked by success+failures keys)."""
    if isinstance(data, dict):
        if "success" in data and "failures" in data:
            out.append(data)
        else:
            for value in data.values():
                _collect_case_results(value, out)
    elif isinstance(data, list):
        for item in data:
            _collect_case_results(item, out)


def _annotate_run(envelope: Dict[str, Any]) -> Dict[str, Any]:
    """What it does: Attach per-case verdicts + reconcile hints to a raw run envelope."""
    case_results: List[Dict[str, Any]] = []
    _collect_case_results(envelope.get("data"), case_results)
    reconcile = [_reconcile_case(r) for r in case_results]
    passed = sum(1 for r in reconcile if r["verdict"] == "pass")
    return {
        "summary": {"total": len(reconcile), "passed": passed, "failed": len(reconcile) - passed},
        "reconcile": reconcile,
        "raw": envelope,
    }


# ---------- discovery tools ----------

@mcp.tool()
async def login() -> Dict[str, Any]:
    """Authenticate against the platform (POST /sign_in) and cache the JWT for all later calls.

    Credentials come from PLATFORM_EMAIL / PLATFORM_PASSWORD env vars — never pass them as args.
    """
    username = await client.login()
    return {"authenticated": True, "username": username}


@mcp.tool()
async def list_workspaces() -> Dict[str, Any]:
    """List all workspaces visible to the authenticated user (GET /workspace/list)."""
    envelope = await client.request("GET", "/workspace/list")
    return {"workspaces": envelope.get("data", []), "message": envelope.get("message")}


@mcp.tool()
async def get_workspace_tree(workspace_id: int) -> Dict[str, Any]:
    """Get the full folder/file node tree of a workspace (GET /workspace/{workspace_id})."""
    envelope = await client.request("GET", f"/workspace/{workspace_id}")
    return {"tree": envelope.get("data", {})}


@mcp.tool()
async def list_apis(workspace_id: int) -> Dict[str, Any]:
    """List all APIs in a workspace via the bulk-testing tree
    (GET /workspace/{workspace_id}/bulk-testing-tree) — includes file ids, methods, endpoints, case counts.
    """
    envelope = await client.request("GET", f"/workspace/{workspace_id}/bulk-testing-tree")
    return {"tree": envelope.get("data", {})}


@mcp.tool()
async def get_api(file_id: int) -> Dict[str, Any]:
    """Get the API definition stored on a file node (GET /file/{file_id}/api)."""
    envelope = await client.request("GET", f"/file/{file_id}/api")
    return {"api": envelope.get("data", {})}


@mcp.tool()
async def list_cases(file_id: int) -> Dict[str, Any]:
    """List all test cases attached to a file's API (GET /file/{file_id}/api/cases)."""
    envelope = await client.request("GET", f"/file/{file_id}/api/cases")
    return {"cases": envelope.get("data", []), "pagination": envelope.get("pagination")}


@mcp.tool()
async def list_environments(workspace_id: int) -> Dict[str, Any]:
    """List all environments in a workspace (GET /environment/workspace/{workspace_id}/environments)."""
    envelope = await client.request(
        "GET", f"/environment/workspace/{workspace_id}/environments"
    )
    return {"environments": envelope.get("data", [])}


# ---------- authoring tools (bulk-first) ----------

@mcp.tool()
async def sync_project(
    workspace_id: int, items: List[Dict[str, Any]], force: bool = False
) -> Dict[str, Any]:
    """Mirror a whole project tree (folders + APIs + cases) into the platform in ONE call
    (POST /node/bulk-import). This is the primary authoring tool — prefer it over granular calls.

    items is a FLAT list, parent-before-child, each item:
      {"temp_id": "f1", "name": "billing", "type": "folder", "parent_temp_id": null}
      {"temp_id": "a1", "name": "create_invoice", "type": "file", "parent_temp_id": "f1",
       "api": {"name": "create_invoice", "method": "POST", "endpoint": "/api/v1/invoices"},
       "cases": [{"name": "happy path", "headers": {}, "params": {}, "body": {}, "expected": {...}}]}

    Folders must omit api/cases. IDEMPOTENCY: the platform does NOT reject duplicate names —
    it silently imports them renamed as "name (imported)", duplicating the tree. This tool
    therefore pre-checks the workspace: if any root-level item name already exists, it returns
    status "collision" with the clashing names and imports NOTHING. Add only new subtrees, use
    granular tools (save_cases_bulk etc.) for existing ones, or pass force=true to import
    anyway (platform will rename the clashes).
    """
    # Fail fast on shape errors before the round-trip
    seen_temp_ids = set()
    for i, item in enumerate(items):
        for required in ("temp_id", "name", "type"):
            if not item.get(required):
                raise ValueError(f"items[{i}] missing required field {required!r}")
        if item["type"] not in VALID_NODE_TYPES:
            raise ValueError(f"items[{i}].type must be 'folder' or 'file', got {item['type']!r}")
        _validate_node_name(item["name"])
        if item["temp_id"] in seen_temp_ids:
            raise ValueError(f"items[{i}].temp_id {item['temp_id']!r} is duplicated")
        seen_temp_ids.add(item["temp_id"])
        parent = item.get("parent_temp_id")
        if parent is not None and parent not in seen_temp_ids:
            raise ValueError(
                f"items[{i}].parent_temp_id {parent!r} not defined earlier in the list "
                "(parent-before-child ordering is required)"
            )
        if item["type"] == "folder" and (item.get("api") or item.get("cases")):
            raise ValueError(f"items[{i}] is a folder — folders must omit api/cases")
        if item["type"] == "file":
            api = item.get("api")
            if api and not (api.get("name") and api.get("endpoint")):
                raise ValueError(f"items[{i}].api requires name and endpoint")

    # Collision guard: platform renames duplicates ("name (imported)") instead of rejecting,
    # so an unchecked re-run silently duplicates the whole tree.
    if not force:
        tree_env = await client.request("GET", f"/workspace/{workspace_id}")
        existing_root = {
            node.get("name")
            for node, parent in _iter_tree_nodes(tree_env.get("data"))
            if parent is None and node.get("parent_id") is None
        }
        root_items = [it["name"] for it in items if it.get("parent_temp_id") is None]
        collisions = sorted(set(root_items) & existing_root)
        if collisions:
            return {
                "status": "collision",
                "collisions": collisions,
                "note": "These root items already exist in the workspace — nothing was "
                "imported. Import only new subtrees, use granular tools for existing "
                "ones, or re-call with force=true (platform will rename clashes to "
                "'name (imported)').",
            }

    try:
        envelope = await client.request(
            "POST", "/node/bulk-import", json={"workspace_id": workspace_id, "items": items}
        )
        return {
            "status": "imported",
            "data": envelope.get("data"),
            "message": envelope.get("message"),
        }
    except PlatformError as err:
        if _is_duplicate_error(err):
            return {
                "status": "already_exists",
                "detail": err.error_message,
                "note": "Duplicate node names in the same parent — treat as success. "
                "Use ensure_folder/save_cases_bulk for incremental additions.",
            }
        raise


@mcp.tool()
async def ensure_folder(
    workspace_id: int, name: str, parent_id: Optional[int] = None
) -> Dict[str, Any]:
    """Create a folder if missing, return the existing one if present — safe to re-run
    (GET /workspace/{id} tree lookup, then POST /node/create).
    """
    _validate_node_name(name)
    tree_env = await client.request("GET", f"/workspace/{workspace_id}")
    existing = _find_node_in_tree(tree_env.get("data"), name, "folder", parent_id)
    if existing:
        return {"status": "already_exists", "folder": existing}

    try:
        envelope = await client.request(
            "POST",
            "/node/create",
            json={
                "workspace_id": workspace_id,
                "name": name,
                "type": "folder",
                "parent_id": parent_id,
            },
        )
    except PlatformError as err:
        if not _is_duplicate_error(err):
            raise
        envelope = await client.request("GET", f"/workspace/{workspace_id}")

    created = _find_node_in_tree(envelope.get("data"), name, "folder", parent_id)
    return {"status": "created", "folder": created or {"name": name, "parent_id": parent_id}}


@mcp.tool()
async def create_api_file(
    workspace_id: int,
    name: str,
    parent_id: int,
    api: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Create a file node under a folder and optionally attach its API definition
    (POST /node/create, then POST /file/{file_id}/api/save).

    api (optional): {"name": str, "method": "GET|POST|...", "endpoint": "/path", "description": str?}
    """
    _validate_node_name(name)
    try:
        envelope = await client.request(
            "POST",
            "/node/create",
            json={
                "workspace_id": workspace_id,
                "name": name,
                "type": "file",
                "parent_id": parent_id,
            },
        )
        status = "created"
    except PlatformError as err:
        if not _is_duplicate_error(err):
            raise
        envelope = await client.request("GET", f"/workspace/{workspace_id}")
        status = "already_exists"

    node = _find_node_in_tree(envelope.get("data"), name, "file", parent_id)
    if not node or not node.get("id"):
        raise PlatformError(500, f"File node {name!r} not found in tree after create")

    result: Dict[str, Any] = {"status": status, "file": node}
    if api:
        saved = await client.request(
            "POST",
            f"/file/{node['id']}/api/save",
            json={
                "name": api.get("name", name),
                "method": api.get("method", "GET"),
                "endpoint": api["endpoint"],
                "description": api.get("description"),
                "is_active": api.get("is_active", True),
                "extra_meta": api.get("extra_meta"),
            },
        )
        result["api"] = saved.get("data")
    return result


@mcp.tool()
async def rename_node(
    node_id: int, name: Optional[str] = None, parent_id: Optional[int] = None
) -> Dict[str, Any]:
    """Rename and/or reparent a folder or file node (PUT /node/{node_id}).

    Use when an existing endpoint's file has a different name than the source tree: rename it toward the
    source name instead of creating a duplicate. Pass ``name`` to rename, ``parent_id`` to move; at least
    one is required. The platform rejects a duplicate name in the target location and circular moves.
    """
    if not name and parent_id is None:
        raise ValueError("rename_node requires at least one of: name, parent_id")
    if name is not None:
        _validate_node_name(name)

    payload: Dict[str, Any] = {}
    if name is not None:
        payload["name"] = name
    if parent_id is not None:
        payload["parent_id"] = parent_id

    envelope = await client.request("PUT", f"/node/{node_id}", json=payload)
    return {"status": "updated", "node_id": node_id, "tree": envelope.get("data")}


@mcp.tool()
async def save_api_request(
    file_id: int,
    name: str,
    method: str,
    endpoint: str,
    description: Optional[str] = None,
    is_active: bool = True,
    extra_meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Save/replace the API definition on an existing file node (POST /file/{file_id}/api/save)."""
    if not name.strip() or not endpoint.strip():
        raise ValueError("name and endpoint must be non-empty")
    envelope = await client.request(
        "POST",
        f"/file/{file_id}/api/save",
        json={
            "name": name,
            "method": method,
            "endpoint": endpoint,
            "description": description,
            "is_active": is_active,
            "extra_meta": extra_meta,
        },
    )
    return {"api": envelope.get("data"), "message": envelope.get("message")}


@mcp.tool()
async def save_cases_bulk(file_id: int, cases: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Save multiple test cases onto a file's API (POST /file/{file_id}/api/cases/bulk).

    Each case: {"name": str, "headers": dict?, "params": dict?, "body": dict?, "expected": dict?}
    The expected block must follow the platform assertion contract (status/status_in +
    at least one body assertion via json.checks / json.either / text_contains).
    The platform rejects duplicate case names, both within the payload and vs existing cases.
    """
    names = [c.get("name", "").strip() for c in cases]
    if any(not n for n in names):
        raise ValueError("Every case needs a non-empty name")
    dupes = {n for n in names if names.count(n) > 1}
    if dupes:
        raise ValueError(f"Duplicate case names within payload: {sorted(dupes)}")

    try:
        envelope = await client.request(
            "POST", f"/file/{file_id}/api/cases/bulk", json=cases
        )
        return {"status": "saved", "data": envelope.get("data"), "message": envelope.get("message")}
    except PlatformError as err:
        if _is_duplicate_error(err):
            return {
                "status": "duplicate_names",
                "detail": err.error_message,
                "note": "Some case names already exist on this API — rename or list_cases first.",
            }
        raise


# ---------- environment / secrets tools ----------

@mcp.tool()
async def create_environment(
    workspace_id: int,
    name: str,
    description: Optional[str] = None,
    is_active: bool = False,
    variables: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """Create an environment in a workspace (POST /environment/workspace/{id}/environments).

    Ask the USER for real values (base URL, tokens, usernames) — never invent or hardcode them.
    """
    envelope = await client.request(
        "POST",
        f"/environment/workspace/{workspace_id}/environments",
        json={
            "name": name,
            "description": description,
            "is_active": is_active,
            "variables": variables or {},
        },
    )
    return {"environment": envelope.get("data"), "message": envelope.get("message")}


@mcp.tool()
async def set_environment_variables(
    workspace_id: int, environment_id: int, variables: Dict[str, str]
) -> Dict[str, Any]:
    """Set key→value variables on an environment
    (POST /environment/workspace/{ws}/environments/{env}/variables).

    REPLACE semantics (observed live): the payload becomes the environment's full variable
    set — keys not included are dropped. Send the complete dict every time.
    Ask the USER for secret values (tokens, passwords, base URLs) — never invent or hardcode them.
    """
    if not variables:
        raise ValueError("variables cannot be empty")
    envelope = await client.request(
        "POST",
        f"/environment/workspace/{workspace_id}/environments/{environment_id}/variables",
        json={"variables": variables},
    )
    return {"data": envelope.get("data"), "message": envelope.get("message")}


@mcp.tool()
async def resolve_variables(
    workspace_id: int, text: str, environment_id: Optional[int] = None
) -> Dict[str, Any]:
    """Resolve {{VAR}} placeholders in a text against an environment
    (POST /environment/workspace/{ws}/environments[/{env}]/resolve).

    environment_id None → the workspace's active environment is used.
    """
    if environment_id is None:
        path = f"/environment/workspace/{workspace_id}/environments/resolve"
    else:
        path = f"/environment/workspace/{workspace_id}/environments/{environment_id}/resolve"
    envelope = await client.request(
        "POST", path, json={"text": text, "environment_id": environment_id}
    )
    return {"resolution": envelope.get("data")}


# ---------- run + reconcile tools ----------

@mcp.tool()
async def run_file_cases(file_id: int, case_ids: Optional[List[int]] = None) -> Dict[str, Any]:
    """Run test cases for one file's API (POST /run). case_ids None runs ALL cases.

    Returns per-case verdicts plus a reconcile hint for every failure:
    target-api-bug vs expected-block-bug vs connectivity. Never silently passes.
    """
    envelope = await client.request(
        "POST", "/run", json={"file_id": file_id, "case_id": case_ids}
    )
    return _annotate_run(envelope)


@mcp.tool()
async def run_bulk(
    workspace_id: int,
    file_ids: Optional[List[int]] = None,
    selections: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Run cases across many files concurrently (POST /bulk_run_cases, workspace_id header).

    Exactly one of:
      file_ids: run ALL cases of each file            → {"type": "api", "apis": [...]}
      selections: [{"file_id": int, "cases": [int]?}] → {"type": "selected", "apis": [...]}

    Returns per-case verdicts + reconcile hints (same contract as run_file_cases).
    """
    if bool(file_ids) == bool(selections):
        raise ValueError("Pass exactly one of file_ids or selections")
    if file_ids:
        body: Dict[str, Any] = {"type": "api", "apis": file_ids}
    else:
        for i, sel in enumerate(selections or []):
            if "file_id" not in sel:
                raise ValueError(f"selections[{i}] missing file_id")
        body = {"type": "selected", "apis": selections}

    envelope = await client.request(
        "POST",
        "/bulk_run_cases",
        json=body,
        extra_headers={"workspace_id": str(workspace_id)},
    )
    return _annotate_run(envelope)


@mcp.tool()
async def diff_runs(exec_id: int, compare_exec_id: int) -> Dict[str, Any]:
    """Regression-diff two SCHEDULED bulk execution result sets
    (GET /run/{exec_id}/diff?compare_exec_id=...) — added/removed cases + changed response fields.

    Only works for executions created by schedules (BulkTestExecution ids), not ad-hoc runs —
    for ad-hoc runs use the reconcile output of run_file_cases / run_bulk directly.
    """
    envelope = await client.request(
        "GET", f"/run/{exec_id}/diff", params={"compare_exec_id": compare_exec_id}
    )
    return {"diff": envelope.get("data")}


# ---------- change detection ----------

@mcp.tool()
async def compare_changes(
    workspace_id: int, target_routes: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Compare the target project's current routes against what is mirrored in the platform.

    target_routes: [{"method": "GET", "endpoint": "/api/v1/users", "name": "list_users"?}, ...]
    Returns added (in target, not in platform), removed (in platform, not in target),
    and renamed (same method+endpoint, different name). Uses the bulk-testing tree as
    the platform-side source of truth.
    """
    envelope = await client.request("GET", f"/workspace/{workspace_id}/bulk-testing-tree")

    # Collect platform APIs generically from the tree: any dict carrying method+endpoint
    platform_apis: List[Dict[str, Any]] = []

    def _collect(node: Any) -> None:
        if isinstance(node, dict):
            if node.get("method") and node.get("endpoint"):
                platform_apis.append(node)
            for value in node.values():
                _collect(value)
        elif isinstance(node, list):
            for item in node:
                _collect(item)

    _collect(envelope.get("data"))

    def _key(method: str, endpoint: str) -> str:
        return f"{method.upper().strip()} {endpoint.strip()}"

    platform_map = {_key(a["method"], a["endpoint"]): a for a in platform_apis}
    target_map = {_key(r["method"], r["endpoint"]): r for r in target_routes}

    added = [target_map[k] for k in target_map.keys() - platform_map.keys()]
    removed = [
        {"method": a.get("method"), "endpoint": a.get("endpoint"), "name": a.get("name"),
         "file_id": a.get("file_id") or a.get("id")}
        for k, a in platform_map.items() if k not in target_map
    ]
    renamed = [
        {"endpoint": platform_map[k].get("endpoint"), "method": platform_map[k].get("method"),
         "platform_name": platform_map[k].get("name"), "target_name": target_map[k].get("name")}
        for k in platform_map.keys() & target_map.keys()
        if target_map[k].get("name") and platform_map[k].get("name")
        and target_map[k]["name"] != platform_map[k]["name"]
    ]

    return {
        "added": added,
        "removed": removed,
        "renamed": renamed,
        "unchanged_count": len(platform_map.keys() & target_map.keys()) - len(renamed),
    }


# ---------- export ----------

@mcp.tool()
async def export_results_table(reconcile: List[Dict[str, Any]], title: str = "API Test Results") -> Dict[str, Any]:
    """Format run reconcile output (from run_file_cases/run_bulk) into a Markdown table and
    Confluence storage-format XHTML — ready for the agent to publish via its Atlassian tools.

    Pure transform, no platform call. Pass the `reconcile` list from a run tool's output.
    """
    header = "| Case | Verdict | Status | Failures / Hint |\n|---|---|---|---|"
    md_rows, cf_rows = [], []
    for r in reconcile:
        case = str(r.get("case") or r.get("case_id") or "?")
        verdict = r.get("verdict", "?")
        status = str(r.get("status_code") if r.get("status_code") is not None else "-")
        detail = "" if verdict == "pass" else "; ".join(map(str, r.get("failures", []))) + f" — {r.get('hint', '')}"
        detail_md = detail.replace("|", "\\|")
        md_rows.append(f"| {case} | {verdict} | {status} | {detail_md} |")
        cf_rows.append(
            f"<tr><td>{case}</td><td>{verdict}</td><td>{status}</td><td>{detail}</td></tr>"
        )

    markdown = f"## {title}\n\n{header}\n" + "\n".join(md_rows)
    confluence = (
        f"<h2>{title}</h2><table><tbody>"
        "<tr><th>Case</th><th>Verdict</th><th>Status</th><th>Failures / Hint</th></tr>"
        + "".join(cf_rows)
        + "</tbody></table>"
    )
    passed = sum(1 for r in reconcile if r.get("verdict") == "pass")
    return {
        "markdown": markdown,
        "confluence_storage": confluence,
        "summary": {"total": len(reconcile), "passed": passed, "failed": len(reconcile) - passed},
    }


@mcp.prompt(title="Run the ApiPilot test pipeline")
def test_pipeline() -> str:
    """Return the current end-to-end test workflow so any connected client can run it.

    Reads TEST_WORKFLOW.md and the case-generation prompt fresh on every call, so the pipeline a
    client receives always matches the latest edited version — no per-user skill, no server restart.
    """
    workflow = _read_source_file(TEST_WORKFLOW_PATH, "TEST_WORKFLOW.md")
    casegen = _read_source_file(CASEGEN_PROMPT_PATH, "case-generation prompt")
    return (
        "Run the ApiPilot API test pipeline. Follow the workflow below exactly, using this server's "
        "tools (login, get_workspace_tree, get_api, ensure_folder, create_api_file, save_cases_bulk, "
        "set_environment_variables, run_file_cases, export_results_table, ...).\n\n"
        "=== WORKFLOW (source of truth) ===\n"
        f"{workflow}\n\n"
        "=== CASE-GENERATION PROMPT (authoritative for case shape / expected blocks) ===\n"
        f"{casegen}\n"
    )


@mcp.resource("workflow://test-pipeline", title="ApiPilot test workflow", mime_type="text/markdown")
def workflow_resource() -> str:
    """What it does: Serve the live test workflow doc so clients always read the current version."""
    return _read_source_file(TEST_WORKFLOW_PATH, "TEST_WORKFLOW.md")


@mcp.resource("prompt://case-generation", title="Case-generation prompt", mime_type="text/plain")
def casegen_resource() -> str:
    """What it does: Serve the live case-generation prompt so clients always read the current version."""
    return _read_source_file(CASEGEN_PROMPT_PATH, "case-generation prompt")


def main() -> None:
    """Run the MCP server over stdio."""
    try:
        mcp.run()
    finally:
        import asyncio
        try:
            asyncio.run(client.close())
        except Exception:
            pass


if __name__ == "__main__":
    main()
