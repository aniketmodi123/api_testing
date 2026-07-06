"""
What this file does: Stdio MCP server exposing the API-testing platform as agent tools —
discovery, bulk project sync, environment variables, test runs with reconcile hints, and
result export. Requires env vars PLATFORM_BASE_URL, PLATFORM_EMAIL, PLATFORM_PASSWORD.
"""

import asyncio
import json
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
SKILL_PATH = _REPO_DIR / "research" / "mcp" / "skill" / "SKILL.md"
SKILL_INSTALL_PATH = "~/.claude/skills/apipilot-test/SKILL.md"

_SERVER_INSTRUCTIONS = (
    "ApiPilot test-automation server. BEFORE using any other tool, call the `how_to_use` tool once — "
    "it returns the current end-to-end workflow (generate cases, mirror the folder tree, fill "
    "variables, run, judge expected-vs-response, export) plus the case-generation contract "
    "(case shape, expected-block rules, variable rules). Skipping it causes the known failure modes: "
    "variables in params/body, unconfigured {{vars}} sent as literal text, guessed DB ids (mass 206s). "
    "The same content is also available as the `test_pipeline` prompt and as live resources "
    "(`workflow://test-pipeline`, `prompt://case-generation`) — all read fresh from the source files "
    "on every call, so they always reflect the latest edited version. "
    "To add the `/apipilot-test` slash command on a device that only has this MCP connection, call "
    "`install_skill` and write its returned content to the returned path — the pipeline itself already "
    "works without it via the `test_pipeline` prompt."
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

def _pipeline_text() -> str:
    """What it does: Build the full pipeline text (workflow + case-gen contract) from the live source files."""
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
        "response": _truncate_response(result.get("response")),
    }


# Cap per-case response snippets in reconcile output — full bodies of a big run blow past
# agent context limits; the snippet is for judging a failure, not for archiving the payload.
_RESPONSE_SNIPPET_CHARS = 800


def _truncate_response(response: Any) -> Any:
    """What it does: Shrink a response body to a judgment-sized snippet, marking any truncation."""
    if response is None:
        return None
    try:
        text = json.dumps(response, default=str)
    except (TypeError, ValueError):
        text = str(response)
    if len(text) <= _RESPONSE_SNIPPET_CHARS:
        return response
    return {"_truncated": True, "_snippet": text[:_RESPONSE_SNIPPET_CHARS]}


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


def _annotate_run(envelope: Dict[str, Any], include_raw: bool = False) -> Dict[str, Any]:
    """What it does: Attach per-case verdicts + reconcile hints to a raw run envelope."""
    case_results: List[Dict[str, Any]] = []
    _collect_case_results(envelope.get("data"), case_results)
    reconcile = [_reconcile_case(r) for r in case_results]
    passed = sum(1 for r in reconcile if r["verdict"] == "pass")
    result = {
        "summary": {"total": len(reconcile), "passed": passed, "failed": len(reconcile) - passed},
        "reconcile": reconcile,
    }
    # raw duplicates reconcile with full response bodies — several 100KB on a big run.
    # Off by default; the reconcile snippets carry everything needed to judge failures.
    if include_raw:
        result["raw"] = envelope
    return result


# ---------- discovery tools ----------

@mcp.tool()
async def how_to_use() -> str:
    """START HERE — call this ONCE before any other tool if you have not read the pipeline yet.

    Returns the full end-to-end test workflow + the case-generation contract (case shape,
    expected-block rules, variable rules, judgment buckets). Read fresh from the source files
    on every call, so it always matches the latest version. Without this you WILL make the
    known mistakes: variables in params/body, unconfigured {{vars}}, guessed DB ids (mass 206s),
    loosened assertions. One call = complete knowledge; no other setup needed.
    """
    return _pipeline_text()


@mcp.tool()
async def install_skill() -> Dict[str, Any]:
    """Install the /apipilot-test slash command on THIS device — for a client that only has the MCP connection.

    Returns the canonical skill file text plus the target path. The agent writes `content` verbatim
    to `install_path` (expand `~`, create parent dirs), which registers the /apipilot-test slash
    command in Claude Code — no repo access needed. Read fresh from the server's source file, so a
    re-call after the skill changes server-side updates the local copy. Note: the full pipeline works
    WITHOUT this via the `test_pipeline` prompt; this only adds the /apipilot-test trigger.
    """
    content = _read_source_file(SKILL_PATH, "SKILL.md")
    return {
        "install_path": SKILL_INSTALL_PATH,
        "content": content,
        "instructions": (
            f"Write `content` verbatim to `{SKILL_INSTALL_PATH}` (expand ~ to the user's home dir; "
            "create parent dirs if missing). This registers the /apipilot-test slash command on this "
            "device. To update after a server-side change, call install_skill again and overwrite the file."
        ),
    }


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


def _compact_tree_node(node: Any) -> Any:
    """What it does: Strip a tree node to navigation essentials (id/name/type/method/endpoint/children)."""
    if isinstance(node, list):
        return [_compact_tree_node(n) for n in node]
    if not isinstance(node, dict):
        return node
    slim: Dict[str, Any] = {
        "id": node.get("id"),
        "name": node.get("name"),
        "type": node.get("type"),
    }
    # method/endpoint live DIRECTLY on platform tree nodes; a nested "api" dict is a
    # legacy shape — support both (observed live: workspace tree + bulk-testing-tree
    # both use direct fields).
    api = node.get("api") if isinstance(node.get("api"), dict) else node
    if api.get("method"):
        slim["method"] = api.get("method")
        slim["endpoint"] = api.get("endpoint")
    cases = node.get("cases") or node.get("test_cases")
    if isinstance(cases, list):
        slim["case_count"] = len(cases)
    elif isinstance(node.get("total_cases"), int):
        slim["case_count"] = node["total_cases"]
    # The workspace root nests children under "file_tree"; inner nodes use "children".
    children = node.get("children") or node.get("file_tree")
    if children:
        if node.get("type") == "file":
            # A file's children are its test cases — collapse to a count, list_cases
            # fetches details. Inlining 1000+ case names would flood agent context.
            slim.setdefault("case_count", len(children))
        else:
            slim["children"] = [_compact_tree_node(c) for c in children]
    return slim


def _flatten_apis(node: Any, path: str, out: List[Dict[str, Any]]) -> None:
    """What it does: Collect every file node carrying an API into a flat list with its folder path."""
    if isinstance(node, list):
        for item in node:
            _flatten_apis(item, path, out)
        return
    if not isinstance(node, dict):
        return
    own_path = f"{path}/{node.get('name')}" if node.get("name") else path
    # File nodes carry method/endpoint DIRECTLY (observed live on bulk-testing-tree);
    # a nested "api" dict is a legacy shape — support both.
    api = node.get("api") if isinstance(node.get("api"), dict) else node
    if node.get("type") == "file" and api.get("method"):
        cases = node.get("cases") or node.get("test_cases") or api.get("cases") or []
        case_count = len(cases) if isinstance(cases, list) else cases
        if isinstance(node.get("total_cases"), int):
            case_count = node["total_cases"]
        out.append(
            {
                "file_id": node.get("id"),
                "name": node.get("name"),
                "path": own_path,
                "method": api.get("method"),
                "endpoint": api.get("endpoint"),
                "case_count": case_count,
            }
        )
    # The workspace root nests children under "file_tree"/"tree"; inner nodes use "children".
    for child in node.get("children") or node.get("file_tree") or node.get("tree") or []:
        _flatten_apis(child, own_path, out)


@mcp.tool()
async def get_workspace_tree(workspace_id: int, compact: bool = True) -> Dict[str, Any]:
    """Get the folder/file node tree of a workspace (GET /workspace/{workspace_id}).

    compact=True (default) returns only id/name/type/method/endpoint/case_count per node —
    full node payloads on a real workspace overflow agent context. Pass compact=False for raw.
    """
    envelope = await client.request("GET", f"/workspace/{workspace_id}")
    data = envelope.get("data", {})
    return {"tree": _compact_tree_node(data) if compact else data}


@mcp.tool()
async def list_apis(workspace_id: int) -> Dict[str, Any]:
    """List all APIs in a workspace as a FLAT list — file_id, name, folder path, method,
    endpoint, case_count (GET /workspace/{workspace_id}/bulk-testing-tree, flattened).

    Use this to find an existing endpoint before creating files; fetch details via get_api/list_cases.
    """
    envelope = await client.request("GET", f"/workspace/{workspace_id}/bulk-testing-tree")
    data = envelope.get("data", {})
    apis: List[Dict[str, Any]] = []
    _flatten_apis(data.get("tree", data), "", apis)
    return {"apis": apis, "total": len(apis)}


@mcp.tool()
async def get_api(file_id: int) -> Dict[str, Any]:
    """Get the API definition stored on a file node (GET /file/{file_id}/api)."""
    envelope = await client.request("GET", f"/file/{file_id}/api")
    return {"api": envelope.get("data", {})}


@mcp.tool()
async def list_cases(file_id: int) -> Dict[str, Any]:
    """List all test cases attached to a file's API (GET /file/{file_id}/api/cases)."""
    envelope = await client.request("GET", f"/file/{file_id}/api/cases")
    data = envelope.get("data") or {}
    return {
        "cases": data.get("test_cases") or [],
        "total": data.get("total_cases", 0),
        "api": {k: data.get(k) for k in ("api_id", "api_name", "api_method", "api_endpoint")},
    }


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
    First time on this server? Call how_to_use() first — it returns the full pipeline + case rules.

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
    First time on this server? Call how_to_use() first — it returns the full pipeline + case rules.

    Each case: {"name": str, "headers": dict?, "params": dict?, "body": dict?, "expected": dict?}
    The expected block must follow the platform assertion contract (status/status_in +
    at least one body assertion via json.checks / json.either / text_contains).
    The platform rejects duplicate case names, both within the payload and vs existing cases.

    VARIABLES: {{var}} is ONLY for values shared across many APIs — auth/identity HEADERS
    (token, username, usertype; personas: consumer_token/consumer_username/consumer_usertype).
    params/body are ALWAYS literals — never a {{var}}. A valid data value (real site_id/sc_no)
    is a literal grounded from the target DB; an INVALID value (bad token, wrong id) is a literal
    too. Any {{var}} referenced must already exist in the active env; if not, ask the user and
    set_environment_variables FIRST — an unconfigured {{var}} runs as literal text and fails wholesale.
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


@mcp.tool()
async def update_case(
    file_id: int,
    case_id: int,
    name: Optional[str] = None,
    headers: Optional[Dict[str, Any]] = None,
    params: Optional[Dict[str, Any]] = None,
    body: Optional[Dict[str, Any]] = None,
    expected: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Update an existing test case in place (POST /file/{file_id}/api/cases/save?case_id=...).

    Only the fields you pass change; omitted fields keep their stored value. This is the repair
    tool for expected-block-bugs found by run reconcile — fix the assertion, keep the case id.
    At least one field is required.
    """
    fields = {"name": name, "headers": headers, "params": params, "body": body, "expected": expected}
    payload = {k: v for k, v in fields.items() if v is not None}
    if not payload:
        raise ValueError("update_case requires at least one of: name, headers, params, body, expected")
    if "name" not in payload:
        # Platform save endpoint requires a name — fetch the stored one to keep it unchanged.
        case_env = await client.request("GET", f"/case/{case_id}")
        stored = case_env.get("data") or {}
        payload["name"] = stored.get("name")
        if not payload["name"]:
            raise PlatformError(404, f"Case {case_id} not found or has no name")
    envelope = await client.request(
        "POST",
        f"/file/{file_id}/api/cases/save",
        json=payload,
        params={"case_id": case_id},
    )
    return {"status": "updated", "case": envelope.get("data"), "message": envelope.get("message")}


@mcp.tool()
async def delete_case(case_id: int) -> Dict[str, Any]:
    """Delete a single test case (DELETE /case/{case_id}).

    Permanent. Prefer update_case to fix a broken expected block — delete only true duplicates
    or cases that no longer apply to the endpoint.
    """
    envelope = await client.request("DELETE", f"/case/{case_id}")
    return {"status": "deleted", "case_id": case_id, "message": envelope.get("message")}


# ---------- deterministic standard cases (token-free generation) ----------

_STD_FLAGS = {"_mirror_http_status": True, "_require_content_for_error": True}


def _std_validation_expected(envelope: str) -> Dict[str, Any]:
    """What it does: Build the expected block for a validation-error case per envelope style."""
    if envelope == "fastapi":
        checks = [
            {"path": "detail", "present": True},
            {"path": "detail[0].msg", "present": True},
        ]
    else:
        checks = [{"path": "error_message", "present": True}]
    return {"status_in": [400, 422], "json": {"checks": checks}, **_STD_FLAGS}


def _std_auth_expected(contains: str) -> Dict[str, Any]:
    """What it does: Build the expected block for a 401 auth-failure case."""
    return {"status": 401, "text_contains": contains, **_STD_FLAGS}


@mcp.tool()
async def generate_standard_cases(
    file_id: int,
    base_params: Optional[Dict[str, Any]] = None,
    base_body: Optional[Dict[str, Any]] = None,
    required_params: Optional[List[str]] = None,
    required_body_fields: Optional[List[str]] = None,
    int_fields: Optional[List[str]] = None,
    auth_headers: Optional[List[str]] = None,
    envelope: str = "custom",
    auth_401_contains: str = "Invalid token",
    save: bool = True,
) -> Dict[str, Any]:
    """Mechanically expand the standard negative-case matrix for an API — auth failures plus
    missing / empty / whitespace / wrong-type mutations of each required field — and save them
    onto the file in one call. Zero generation tokens: the matrix is built server-side and only
    the case NAMES come back. The agent then writes ONLY the interesting cases itself (happy
    path, boundaries, business logic, 409 conflicts).

    Args:
        base_params: Valid baseline query params; every name in required_params must be a key
            here (each mutation starts from this baseline). ``None`` when the endpoint has none.
        base_body: Valid baseline JSON body; same contract for required_body_fields.
        required_params: Query param names to mutate one at a time (missing/empty/whitespace).
        required_body_fields: Body field names to mutate one at a time.
        int_fields: Names (from either list) that are numeric — adds one wrong-type case each.
        auth_headers: Header names carrying auth; defaults to ``["Authorization"]``. One
            missing-header 401 case per name plus one invalid-token case for the first.
        envelope: ``"custom"`` (default) → validation errors assert ``error_message`` present;
            ``"fastapi"`` → asserts raw ``detail[]``.
        auth_401_contains: Substring the 401 response body must contain.
        save: ``True`` (default) saves via the bulk endpoint and returns names only; ``False``
            returns the full case JSONs for review without saving.

    Returns:
        dict: ``generated`` count, ``names`` list, ``skipped_existing`` (name clashes left
        untouched), and ``cases`` only when ``save=False``.

    Steps:
        - Step 1: Validate that every required field exists in its baseline; fail fast otherwise
        - Step 2: Build auth cases (one per auth header + one invalid-token) and per-field mutations
        - Step 3: Fetch existing case names and drop clashes (idempotent re-runs)
        - Step 4: Save the remainder via the bulk endpoint unless save=False
    """
    required_params = required_params or []
    required_body_fields = required_body_fields or []
    int_set = set(int_fields or [])
    auth_hdrs = auth_headers or ["Authorization"]
    params = base_params or {}
    body = base_body or {}

    # Step 1: Fail fast — each mutated field must exist in its baseline
    missing_from_base = [p for p in required_params if p not in params] + [
        f for f in required_body_fields if f not in body
    ]
    if missing_from_base:
        raise ValueError(
            f"Baseline is missing required fields {missing_from_base} — pass a valid "
            "base_params/base_body containing every field you want mutated."
        )
    if envelope not in ("custom", "fastapi"):
        raise ValueError("envelope must be 'custom' or 'fastapi'")

    # Step 2: Expand the matrix
    cases: List[Dict[str, Any]] = []

    for h in auth_hdrs:
        cases.append({
            "name": f"[std] auth - missing {h}",
            "headers": {h: None},
            "params": params,
            "body": body or None,
            "expected": _std_auth_expected(auth_401_contains),
        })
    cases.append({
        "name": "[std] auth - invalid token",
        "headers": {auth_hdrs[0]: "Bearer invalid.token.value"},
        "params": params,
        "body": body or None,
        "expected": _std_auth_expected(auth_401_contains),
    })

    def _mutations(field: str, baseline: Dict[str, Any], kind: str):
        """What it does: Yield (suffix, mutated-dict) pairs for one field of params or body."""
        removed = {k: v for k, v in baseline.items() if k != field}
        yield "missing", removed
        if isinstance(baseline[field], str) or field not in int_set:
            yield "empty string", {**baseline, field: ""}
            yield "whitespace", {**baseline, field: "   "}
        if field in int_set:
            yield "wrong type", {**baseline, field: "not-a-number"}

    for p in required_params:
        for suffix, mutated in _mutations(p, params, "param"):
            cases.append({
                "name": f"[std] param {p} - {suffix}",
                "params": mutated,
                "body": body or None,
                "expected": _std_validation_expected(envelope),
            })
    for f in required_body_fields:
        for suffix, mutated in _mutations(f, body, "field"):
            cases.append({
                "name": f"[std] field {f} - {suffix}",
                "params": params,
                "body": mutated,
                "expected": _std_validation_expected(envelope),
            })

    # Step 3: Idempotency — never clash with cases already on the file.
    # data is a dict payload; the case list lives under data.test_cases.
    existing_env = await client.request("GET", f"/file/{file_id}/api/cases")
    existing_cases = (existing_env.get("data") or {}).get("test_cases") or []
    existing_names = {c.get("name") for c in existing_cases}
    skipped = [c["name"] for c in cases if c["name"] in existing_names]
    cases = [c for c in cases if c["name"] not in existing_names]

    if not save:
        return {"generated": len(cases), "names": [c["name"] for c in cases],
                "skipped_existing": skipped, "cases": cases}

    # Step 4: Persist and return names only (token diet)
    if cases:
        await client.request("POST", f"/file/{file_id}/api/cases/bulk", json=cases)
    return {"generated": len(cases), "names": [c["name"] for c in cases],
            "skipped_existing": skipped, "status": "saved" if cases else "nothing_new"}


# ---------- flow tools (server-side chained CRUD with extraction) ----------

_FLOW_BODY_TRUNCATE = 800


def _truncate_flow_run(run: Dict[str, Any]) -> Dict[str, Any]:
    """What it does: Cap step-result response bodies so a flow run fits the agent context."""
    for step in run.get("steps") or []:
        resp = step.get("response")
        if isinstance(resp, dict) and isinstance(resp.get("body"), str) and len(resp["body"]) > _FLOW_BODY_TRUNCATE:
            resp["body"] = resp["body"][:_FLOW_BODY_TRUNCATE] + f"... [truncated, {len(resp['body'])} chars total]"
    return run


@mcp.tool()
async def create_flow(
    workspace_id: int,
    name: str,
    steps: List[Dict[str, Any]],
    description: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a flow — ordered steps executed SERVER-SIDE with jsonpath extraction chaining
    (POST /workspace/{workspace_id}/flow). This is how a CRUD chain runs without agent
    turn-by-turn chaining, and how a UI re-run stays id-safe: create (extract id) →
    read/update (reference {{id}}) → delete ({{id}}) — the server re-extracts a fresh id
    every run.

    Each step:
      {"step_order": 0, "type": "request", "api_id": <Api row id — get_api returns it; NOT the
       file_id>, "config": {"params": {...}, "body": {...}, "headers": {...}},
       "extract": {"created_id": "$.data.id"}}
    Later steps reference extracted vars as {{created_id}} inside config params/body/headers.
    Step types: request | condition ({"var", "op": eq/neq/gt/lt/contains/exists, "value",
    "on_false": "stop"}) | delay ({"delay_ms": n}) | set_var (config = {var: value}).

    A request step "succeeds" when the HTTP call completes — it does NOT assert status codes.
    Verify statuses from get_flow_run step results, or insert condition steps to stop the
    chain early. list_flows first — reuse an existing chain instead of duplicating it.
    """
    if not name.strip():
        raise ValueError("name must be non-empty")
    for i, s in enumerate(steps):
        if s.get("type") == "request" and not s.get("api_id"):
            raise ValueError(f"steps[{i}] is a request step but has no api_id")
    envelope = await client.request(
        "POST",
        f"/workspace/{workspace_id}/flow",
        json={"name": name, "description": description, "steps": steps},
    )
    data = envelope.get("data") or {}
    return {"flow_id": data.get("id"), "name": data.get("name"),
            "steps": len(data.get("steps") or []), "message": envelope.get("message")}


@mcp.tool()
async def list_flows(workspace_id: int) -> Dict[str, Any]:
    """List flows in a workspace (GET /workspace/{workspace_id}/flow) — check here BEFORE
    create_flow so re-runs reuse the existing chain instead of duplicating it."""
    envelope = await client.request("GET", f"/workspace/{workspace_id}/flow")
    return {"flows": envelope.get("data") or []}


@mcp.tool()
async def run_flow(
    flow_id: int,
    input_vars: Optional[Dict[str, Any]] = None,
    wait_seconds: int = 30,
) -> Dict[str, Any]:
    """Trigger a flow and wait for it to finish (POST /flow/{flow_id}/run, then poll
    GET /flow/run/{run_id}). Returns the finished run with per-step results — request/response
    snapshots, extracted variables, and the final context. Response bodies are truncated.

    Args:
        input_vars: Initial run-context variables injected before step 0; ``None`` for none.
        wait_seconds: Max seconds to poll before returning the still-running run_id.
    """
    envelope = await client.request(
        "POST", f"/flow/{flow_id}/run", json={"input_vars": input_vars}
    )
    run_id = (envelope.get("data") or {}).get("run_id")
    if not run_id:
        raise PlatformError(500, "Flow run accepted but no run_id returned")

    for _ in range(max(1, wait_seconds)):
        await asyncio.sleep(1)
        run_env = await client.request("GET", f"/flow/run/{run_id}")
        run = run_env.get("data") or {}
        if run.get("status") in ("completed", "failed"):
            return {"run": _truncate_flow_run(run)}
    return {"run_id": run_id, "status": "running",
            "note": f"Still running after {wait_seconds}s — fetch later with get_flow_run."}


@mcp.tool()
async def get_flow_run(run_id: int) -> Dict[str, Any]:
    """Fetch a single flow run with all step results (GET /flow/run/{run_id}).
    Use after run_flow timed out, or to re-inspect a past chain execution."""
    envelope = await client.request("GET", f"/flow/run/{run_id}")
    return {"run": _truncate_flow_run(envelope.get("data") or {})}


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
    Environments are PERSONAS (admin / consumer / test) — never overwrite a user-owned env;
    put pipeline vars in a pipeline env and activate it. See how_to_use() for the full rules.
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
    set — keys not included are dropped. Send the complete dict every time (fetch current
    vars via list_environments first, merge, then send).
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
async def run_file_cases(
    file_id: int, case_ids: Optional[List[int]] = None, include_raw: bool = False
) -> Dict[str, Any]:
    """Run test cases for one file's API (POST /run). case_ids None runs ALL cases.
    First time on this server? Call how_to_use() first — it returns the full pipeline + case rules.

    PREFLIGHT: every {{var}} the cases use MUST be defined in the ACTIVE environment first.
    An unconfigured {{var}} runs as literal text and fails wholesale — a variable bug, not an
    API bug. Confirm via list_environments/resolve_variables; ask the user + set any missing.

    Returns per-case verdicts plus a reconcile hint for every failure:
    target-api-bug vs expected-block-bug vs connectivity. Never silently passes.
    Failure response bodies are truncated to a judgment-sized snippet; include_raw=True
    returns the full untruncated envelope as well (large — can overflow agent context).
    """
    envelope = await client.request(
        "POST", "/run", json={"file_id": file_id, "case_id": case_ids}
    )
    return _annotate_run(envelope, include_raw=include_raw)


@mcp.tool()
async def run_bulk(
    workspace_id: int,
    file_ids: Optional[List[int]] = None,
    selections: Optional[List[Dict[str, Any]]] = None,
    include_raw: bool = False,
) -> Dict[str, Any]:
    """Run cases across many files concurrently (POST /bulk_run_cases, workspace_id header).
    First time on this server? Call how_to_use() first — it returns the full pipeline + case rules.

    PREFLIGHT: every {{var}} the cases use MUST be defined in the ACTIVE environment first —
    an unconfigured {{var}} runs as literal text and fails wholesale (variable bug, not API bug).

    Exactly one of:
      file_ids: run ALL cases of each file            → {"type": "api", "apis": [...]}
      selections: [{"file_id": int, "cases": [int]?}] → {"type": "selected", "apis": [...]}

    Returns per-case verdicts + reconcile hints (same contract as run_file_cases).
    Failure response bodies are truncated; include_raw=True adds the full envelope (large).
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
        # FastAPI Header(...) maps param `workspace_id` to the hyphenated header `workspace-id`
        # (convert_underscores default). Sending the underscore form is silently ignored → 422.
        extra_headers={"workspace-id": str(workspace_id)},
    )
    return _annotate_run(envelope, include_raw=include_raw)


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
    return _pipeline_text()


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
