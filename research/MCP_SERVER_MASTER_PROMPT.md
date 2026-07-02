# MASTER PROMPT — Build the API-Testing Platform MCP Server (single session)

> Paste this whole file as the first message to **Fable** in a session with read/write access to `/Users/aniketmodi/Desktop/api_testing`.
> This is a **single-session task**: light targeted research **and** build the working MCP server in one pass. Everything Fable needs to avoid guessing is embedded below — do not explore the repo beyond the small read-list in §3. Extra exploration wastes tokens and is treated as a mistake.

---

## 1. ROLE & MANDATE

You are a Senior Staff Software Engineer and MCP expert. In **one session** you will:
1. Confirm the embedded facts (§4) against a **fixed, short read-list** (§3) — nothing more.
2. Design the tool surface (§5).
3. **Build** a working Python MCP server (§6) that drives this platform.
4. Write **one** design doc `research/mcp/MCP_DESIGN.md` (§7).

**No guessing. No hallucinated endpoints or fields.** If a needed detail is not in §4 and not in the read-list, add it to a `## OPEN` section at the top of `MCP_DESIGN.md` and pick the safest documented default — do **not** go spelunking through all 90 routers. Every non-obvious claim gets a confidence tag (High/Medium/Low).

---

## 2. THE TWO PROJECTS (do not confuse)

- **Platform** = the backend **in THIS repo** (`backend/src`). Postman-like. Stores collections/folders/APIs/cases, runs cases, exports docs. **The MCP server talks to this over HTTP.**
- **Target project** = a *separate* backend the user tests. Its routes get mirrored into the Platform. **Not in this repo, not your concern this session.** Your MCP tools must be generic enough for any target project's agent to call.

Flow: `coding agent → MCP server → Platform HTTP API`.

---

## 3. READ-LIST (read ONLY these — in this order; stop when confirmed)

1. `backend/src/main.py` — router mount block = authoritative route index; middleware order.
2. `backend/src/security.py` — how `AuthMiddleware` validates JWT + the `username` header. **Confirm exactly what auth every request needs.**
3. `backend/src/utils.py` around `create_response` (line ~356) — the response envelope keys.
4. `backend/src/schema.py` — all request/response Pydantic models (§4 quotes the workflow ones; open this only to confirm or fill a gap).
5. `backend/gpt_test_case_creatio_prompt.txt` — the exact case-generation contract (the `expected` block rules).

Open a specific router file **only** if §4 lacks a field you must have for a tool you are building. Log each such extra read in `MCP_DESIGN.md` under `## EXTRA READS` with the one field you needed. Budget: **≤ 6 extra router reads total.**

---

## 4. VERIFIED FACTS (embedded — trust after a quick confirm; do not re-derive)

### 4.1 Auth
- Login: `POST /sign_in`, body `{ "email"|"username": ..., "password": ... }` → `{ "access_token": "<JWT>" }` (7-day, cached server-side). *(Confirm the exact body field name in `routers/sso/login.py` — it uses a `UserSignIn` model.)*
- Almost every other route requires **both**: `Authorization: Bearer <JWT>` **and** a `username: <email>` header. Some also require `workspace_id` header (e.g. bulk run). Confirm the pattern in `security.py`.

### 4.2 Response envelope (from `create_response`)
```json
{ "response_code": <int>, "data": <any|omitted>, "message": <str|omitted>,
  "error_message": <str|omitted>, "errors": <validation errors|omitted>, "pagination": <obj|omitted> }
```
- `data` key is **omitted entirely** when falsy. Schema-validation failure overrides code to **422** and adds `errors`.
- Test-case `expected` blocks assert against this envelope (they check `response_code`, absence of `errors`, presence of `error_message`/`detail`). This is why the case prompt mirrors HTTP status into `response_code`.

### 4.3 Data model
`Workspace` → `Node(type: "folder"|"file", parent_id)` → a **file** node owns one `Api` → `ApiCase(api_id, expected JSON)`.
Node name rejects `< > : " / \ | ? *` and must be non-empty (1–255). File nodes must have a `parent_id`.

### 4.4 THE PRIMARY TOOL PATH — bulk import (mirrors whole tree + APIs + cases in ONE call)
`POST /node/bulk-import`, header `username`. Body `BulkImportRequest`:
```json
{
  "workspace_id": <int>,
  "items": [
    { "temp_id": "f1", "name": "billing", "type": "folder", "parent_temp_id": null },
    { "temp_id": "a1", "name": "create_invoice", "type": "file", "parent_temp_id": "f1",
      "api": { "name": "create_invoice", "method": "POST", "endpoint": "/api/v1/invoices", "description": null },
      "cases": [
        { "name": "happy path", "headers": {...}, "params": {...}, "body": {...}, "expected": {...} }
      ] }
  ]
}
```
- `items` is a **flat list**; parent-before-child ordering via `temp_id`/`parent_temp_id`. Folders omit `api`/`cases`. This single endpoint replaces manual folder-create + api-save + case-save. **Make this the main `sync_project` tool's backbone.**

### 4.5 Granular endpoints (use when bulk-import is too coarse — e.g. adding cases to an existing API)
| Purpose | Method + Path | Body model (from `schema.py`) |
|---|---|---|
| Create folder/file node | `POST /node/create` | `NodeCreateRequest{ workspace_id:int, name:str, type:"folder"\|"file", parent_id:int? }` → returns updated tree |
| Save/replace an API on a file | `POST /file/{file_id}/api/save` | `ApiCreateRequest{ name, method, endpoint, description?, is_active=true, extra_meta? }` |
| Update API (headers/body/params) | (see `routers/api/*`) | `ApiUpdateRequest{ name?, method?, endpoint?, description?, is_active?, headers?, body?, params?, extra_meta? }` |
| Save one case | `POST /file/{file_id}/api/cases/save` | `ApiCaseCreateRequest{ name, headers?, body?, params?, expected? }` |
| Save many cases | `POST /file/{file_id}/api/cases/bulk` | list of `ApiCaseCreateRequest`; rejects dup names within payload & vs existing |
| Create environment | `POST` (see `routers/environment/create_environment.py`) | `EnvironmentCreate{ name, description?, is_active=false, variables:{k:v} }` |
| Set env variables | (see `routers/environment/save_variables.py`) | `VariablesSetRequest{ variables: {str:str} }` |
| Resolve variables | `routers/environment/resolve_variables.py` | `VariableResolutionRequest` |
| Run cases for one file | `POST /run` | `RunnerReq{ file_id:int, case_id:list[int]? }` (None = run all) |
| Run cases across files | `POST /bulk_run_cases` (headers `username`+`workspace_id`) | `BulkRunnerApi{type:"api", apis:list[int]}` **or** `BulkRunnerSelected{type:"selected", apis:[{file_id, cases?}]}` |
| Direct/scratch execute | (see `routers/runner/execute_direct.py`) | `ApiExecuteRequest{ file_id?, environment_id?, method="GET", url, headers, params, body, body_type?, options, expected? }` |
| Regression diff | `routers/runner/diff.py` | expected-vs-actual per case |
| Workspace list/tree | `routers/workspace/*` | — |
| Docs generate/publish | `routers/docs/generate.py`, `publish.py` | export path |
| Import OpenAPI spec | `routers/spec/import_spec.py` | **evaluate**: may auto-mirror a target project from its OpenAPI doc, skipping manual case authoring for the request shapes |

`expected` block format is defined entirely by `backend/gpt_test_case_creatio_prompt.txt` and validated server-side by `validate_expected_spec` (`routers/runner/validator.py`). GET endpoints use `status_in:[200,206]` + `json.either`. Do not invent your own assertion schema — reuse that prompt's contract verbatim.

---

## 5. TOOL SURFACE (build only these; each maps to a verified endpoint)

Read/discovery: `login`, `list_workspaces`, `get_workspace_tree`, `list_apis`, `get_api`, `list_cases`, `list_environments`.
Author (bulk-first): `sync_project(workspace_id, items[])` → wraps `/node/bulk-import`; `ensure_folder`, `create_api_file`, `save_api_request`, `save_cases_bulk` (granular fallbacks).
Env/secrets: `set_environment_variables`, `resolve_variables` — must **prompt the user** for token/username/base-URL (via tool input args surfaced to the agent), never hardcode.
Run + reconcile: `run_file_cases`, `run_bulk`, `diff_expected_vs_actual` → returns per-case verdict **plus** the reconcile decision hint: for each mismatch classify **(a) target-API-bug** vs **(b) expected-block-bug**; never silently pass.
Export: `export_results_table`, `publish_to_confluence` (bridge to the `mcp__atlassian__*` tools already in this environment).
Change detection: `compare_changes(workspace_id, target_routes)` → added / removed / renamed endpoints, changed request/response models vs current Platform tree.

Prune anything whose endpoint you cannot verify — log it under `## OPEN`, do not fake it.

---

## 6. BUILD SPEC (write the actual server this session)

- **Language/transport:** Python, stdio MCP server (`mcp` SDK), matching the backend stack. One file or a small package under `backend/mcp_server/` (or `mcp/` at repo root — pick one, state it).
- **Config via env vars only:** `PLATFORM_BASE_URL`, `PLATFORM_EMAIL`, `PLATFORM_PASSWORD` (or a token). Never hardcode secrets or URLs.
- **Auth lifecycle:** login once, cache the JWT in memory, attach `Authorization` + `username` (+ `workspace_id` where required) on every call, re-login on `401`.
- **HTTP client:** `httpx.AsyncClient`, per-call timeout, and map the Platform envelope → MCP result: on non-2xx or presence of `error_message`/`errors`, raise a clean MCP tool error carrying `response_code` + `error_message` (never a raw stack trace).
- **Idempotency:** `ensure_folder` and `sync_project` must be safe to re-run — the platform rejects duplicate node names in the same parent, so treat "already exists" as success, not failure.
- **Guard rails:** validate tool inputs with the same field names/types as §4 models before calling the API (fail fast, save a round-trip).
- **No case generation inside the server** unless explicitly asked — the agent supplies `cases[]`; the server only transports them (the generation contract lives in the txt prompt and is the agent's job).

---

## 7. DELIVERABLES

1. Working MCP server code (per §6).
2. `research/mcp/MCP_DESIGN.md` containing, in this order:
   - `## OPEN` (unresolved facts + chosen safe default + confidence)
   - `## EXTRA READS` (any router opened beyond the read-list + the one field needed)
   - Tool table: name · purpose · Platform endpoint · request → response · auth headers · idempotency · error behavior
   - Auth lifecycle + config + run instructions (how to register the server in an MCP client)
   - The end-to-end workflow call-order (login → workspace → `sync_project` → set env vars → run → diff/reconcile → export)

Keep the doc tight — it is a build record, not an essay.

---

## 8. SELF-CHECK BEFORE FINISHING (do silently, fix before ending)
- Every tool maps to an endpoint verified in the read-list or §4 — zero invented routes/fields.
- Auth headers correct on every call; re-login on 401 present.
- No hardcoded URL/secret; all via env vars.
- `sync_project` re-runnable (dup-name = success).
- Error paths return clean MCP errors, no stack traces.
- Extra router reads ≤ 6 and each logged. Unknowns in `## OPEN`, not guessed.
