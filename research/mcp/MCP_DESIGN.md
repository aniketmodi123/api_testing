# MCP Server — Build Record

Server code: `backend/mcp_server/` (`platform_client.py` + `server.py` + `__main__.py`). Python, stdio transport, `mcp` SDK (FastMCP), `httpx.AsyncClient`.

## LIVE TEST (2026-07-03, platform on Docker :7005, user aniketmodi123@gmail.com)

6/7 read tools verified green through the actual MCP client → real platform:
- `login` ✅ → JWT cached; `list_workspaces` ✅ (5 workspaces); `get_workspace_tree` ✅;
  `get_api` ✅ (file 42, endpoint resolved); `list_cases` ✅; `list_environments` ✅.
- Error mapping ✅ — bad creds → clean `PlatformError(401, "Incorrect username or password")`,
  no stack trace; 401 re-login path confirmed.
- Tree walker `_iter_tree_nodes` ✅ against real shape: workspace tree wraps nodes under a
  `file_tree` key; nodes are `{id, name, type, method, parent_id, children}`; case leaves carry
  no `type` (correctly skipped as non-nodes). Resolved the 3 former Medium items below.

**Platform-side bug found and FIXED (2026-07-03):** `GET /workspace/{id}/bulk-testing-tree`
returned **422** on workspaces holding legacy cases whose stored `body` is not a dict — the
response schemas typed `body`/`expected` as required `Dict[str, Any]` while the `ApiCase.body`/
`expected` JSON columns legally hold any JSON value. Fix applied in `backend/src/schema.py`:
widened `body`/`expected` to `Any = None` in the four case-mirroring **response** models
(`ApiCaseItem`, `TreeCaseItem`, `ApiCaseDetailResponse`, `CaseDuplicateResponse`). Request-side
validation (`ApiCaseCreateRequest` etc.) untouched — boundary stays strict. Verified live:
endpoint now 200, `list_apis` + `compare_changes` green.

**Full write-path live test (workspace `test3`, id 8) — all green:**
- `sync_project` ✅ imported folder+file+api+case; re-run ✅ no duplicate nodes created.
- `ensure_folder` ✅ `already_exists` on re-run. `save_cases_bulk` dup name ✅ clean
  `duplicate_names` status, no exception.
- `run_file_cases` ✅ executed a real HTTP case, run-wrapper parsing + reconcile verdicts work
  (1/1 pass). Former Medium item on run wrapper shape → RESOLVED High.
- `create_environment` / `set_environment_variables` / `resolve_variables` ✅.
  **Observed:** set-variables has REPLACE semantics — payload becomes the full variable set,
  omitted keys are dropped. Tool docstring updated to warn agents.
- Untested live: `diff_runs` (needs two scheduled BulkTestExecution ids — none exist yet).
- All test artifacts cleaned up (nodes 200/201/202/203, environment 30 deleted; workspace 8
  tree verified empty).
- Registration: copy `.mcp.json.example` (repo root) → `.mcp.json`, fill `PLATFORM_PASSWORD`.
  `.mcp.json` is gitignored. MCP server deps pinned in `backend/mcp_server/requirements.txt`.

## OPEN

| Unknown | Safe default chosen | Confidence |
|---|---|---|
| Duplicate-name handling by `/node/bulk-import` | RESOLVED live: platform does **not reject** — it silently imports duplicates renamed `"name (imported)"`, duplicating the tree. `sync_project` now pre-checks root-level names against the workspace tree and returns `status: collision` (imports nothing) unless `force=true`. Verified live: 2× sync → 1 folder. `/node/create` still rejects dups with an "already exist" message (marker match kept for `ensure_folder`) | High |
| Workspace tree node shape | RESOLVED live: nodes under `file_tree`, keys `{id,name,type,method,parent_id,children}`; walker recurses all dict values so wrapper key is irrelevant | High |
| `/run` & `/bulk_run_cases` result wrapper shape | Recursively collect dicts carrying both `success` and `failures` keys (matches `CaseRunResult`) — not yet exercised live (no run executed) | Medium |
| `ApiUpdateRequest` endpoint (update headers/body/params on an API) — not found in `save_api.py`/`list_apis.py` | Tool pruned. `save_api_request` uses only verified `POST /file/{id}/api/save` (`ApiCreateRequest`, no headers/body/params fields). Case-level headers/body/params via cases cover the workflow | High (that it's unverified) |
| `publish_to_confluence` — MCP server cannot call the agent's `mcp__atlassian__*` tools from inside a stdio server | Pruned as a server tool. `export_results_table` returns both Markdown and Confluence storage-format XHTML; the agent publishes via its own Atlassian tools | High |
| `/spec/import` (OpenAPI auto-mirror) semantics | Not built this session — endpoint exists (`POST /spec/import`), evaluate later as alternative to `sync_project` for request shapes | — |
| Live end-to-end test | Platform not running locally during build (health probe on :8000/:8004 failed). Offline smoke test passed: 20 tools registered, input validation + pure-transform tools verified | — |

## EXTRA READS (beyond §3 read-list; budget 6)

| File | Field needed |
|---|---|
| `routers/runner/run_case.py` | `RunnerReq{file_id, case_id: Optional[list[int]]}` + route `POST /run` + `username` header |
| `routers/runner/bulk_run_cases.py` | `BulkRunnerApi/BulkRunnerSelected` shapes + `username`+`workspace_id` headers |
| `routers/runner/diff.py` | `GET /run/{exec_id}/diff?compare_exec_id=` — works only on scheduled `BulkTestExecution` ids |

(Greps only, no full reads: `sso/login.py` → `UserSignIn{email, password}`, `access_token` in data; route decorators across workspace/api/api_cases/environment/docs/spec routers; `node/create_node.py` → `POST /node/create`; `BulkImportItemApi/Case` field lists in `schema.py`.)

## Tool Table

Auth on every call (except `login` itself): `Authorization: Bearer <JWT>` + `username: <PLATFORM_EMAIL>`. Errors: any non-2xx or envelope with `error_message`/`errors` → `PlatformError` carrying `response_code` + `error_message` (+ validation `errors`), no stack traces.

| Tool | Platform endpoint | Request → Response | Idempotent | Notes |
|---|---|---|---|---|
| `login` | `POST /sign_in` | `{email, password}` (env vars) → `{authenticated, username}` | yes | JWT cached in memory; auto re-login on 401 everywhere |
| `list_workspaces` | `GET /workspace/list` | — → `{workspaces}` | yes | |
| `get_workspace_tree` | `GET /workspace/{id}` | — → `{tree}` | yes | |
| `list_apis` | `GET /workspace/{id}/bulk-testing-tree` | — → `{tree}` (files + methods + endpoints + cases) | yes | |
| `get_api` | `GET /file/{id}/api` | — → `{api}` | yes | |
| `list_cases` | `GET /file/{id}/api/cases` | — → `{cases, pagination}` | yes | |
| `list_environments` | `GET /environment/workspace/{id}/environments` | — → `{environments}` | yes | env router mounted at `/environment` prefix |
| `sync_project` | `POST /node/bulk-import` | `{workspace_id, items[], force?}` (flat, parent-before-child via `temp_id`/`parent_temp_id`) → `{status, data}` | re-run safe via collision guard | **Primary authoring tool.** Client-side pre-validation: temp_id uniqueness, parent ordering, folder≠api/cases, name charset. Root-name collision → `status: collision`, imports nothing (platform would rename dups `"name (imported)"`); `force=true` bypasses |
| `ensure_folder` | `GET /workspace/{id}` + `POST /node/create` | `{workspace_id, name, parent_id?}` → `{status, folder}` | yes | Tree lookup first; create only if missing; duplicate race → refetch + return existing |
| `create_api_file` | `POST /node/create` + `POST /file/{id}/api/save` | `{workspace_id, name, parent_id, api?}` → `{status, file, api?}` | yes | File nodes require `parent_id` |
| `save_api_request` | `POST /file/{id}/api/save` | `ApiCreateRequest` fields → `{api}` | yes (replace semantics) | |
| `save_cases_bulk` | `POST /file/{id}/api/cases/bulk` | `list[ApiCaseCreateRequest]` → `{status, data}` | partial | Pre-checks dup names in payload (fail fast); server dup-vs-existing → `status: duplicate_names`, not an exception |
| `create_environment` | `POST /environment/workspace/{id}/environments` | `EnvironmentCreate` → `{environment}` | no | Prompts agent to ask USER for real values |
| `set_environment_variables` | `POST /environment/workspace/{ws}/environments/{env}/variables` | `{variables: {k:v}}` (non-empty) → `{data}` | yes (set semantics) | Never hardcode secrets — agent must ask user |
| `resolve_variables` | `POST /environment/workspace/{ws}/environments[/{env}]/resolve` | `{text, environment_id?}` → `{resolution}` | yes | `env_id` None → active environment |
| `run_file_cases` | `POST /run` | `{file_id, case_id?}` → `{summary, reconcile[], raw}` | yes (read+execute) | `case_ids` None = all cases |
| `run_bulk` | `POST /bulk_run_cases` (+ `workspace_id` header) | `file_ids` → `{type:"api"}` OR `selections` → `{type:"selected"}` → `{summary, reconcile[], raw}` | yes | exactly-one-of guard |
| `diff_runs` | `GET /run/{exec_id}/diff?compare_exec_id=` | → `{diff}` | yes | Scheduled executions only |
| `compare_changes` | `GET /workspace/{id}/bulk-testing-tree` (client-side diff) | `{workspace_id, target_routes[]}` → `{added, removed, renamed, unchanged_count}` | yes | Key = `METHOD endpoint` |
| `export_results_table` | none (pure transform) | `{reconcile[]}` → `{markdown, confluence_storage, summary}` | yes | Agent publishes via its own `mcp__atlassian__*` tools |

### Reconcile contract (run tools — never silently pass)
Per failed case: `verdict: fail` + `hint`:
- `status_code == None` → **connectivity** (timeout/network — env/base-URL problem, not a case bug)
- failure mentions status → **target-api-bug?** (verify target endpoint before touching expected block)
- status matched, body assertion failed → **ambiguous** — agent must compare response snippet vs expected block and decide (a) target-API bug vs (b) expected-block bug

### `expected` block contract
Defined by `backend/gpt_test_case_creatio_prompt.txt`, validated server-side (`routers/runner/validator.py`). Key rules: exactly one of `status`/`status_in`; ≥1 body assertion (`json.checks`/`json.either`/`text_contains*`); mirror envelope `response_code == HTTP status`; success asserts `errors absent`, failure asserts `error_message`/`detail` present; GET uses `status_in:[200,206]` + `json.either` (206 branch: `error_message contains "No Data Found"`, `data absent`); flags `_mirror_http_status: true`, `_require_content_for_error: true`. The MCP server transports cases verbatim — generation is the agent's job.

## Auth lifecycle + config + run

- Env vars (all required, no defaults, never hardcoded): `PLATFORM_BASE_URL`, `PLATFORM_EMAIL`, `PLATFORM_PASSWORD`.
- Lifecycle: lazy login on first tool call → JWT cached in process memory → every request sends `Authorization: Bearer` + `username` headers → on 401, exactly one re-login + retry → `PlatformError` if still failing.
- Envelope mapping: `data` key may be absent (falsy data omitted); 422 + `errors` on schema validation failures — both surfaced in `PlatformError`.
- Dependency: `mcp>=1.2` (installed into the active venv this session), `httpx` (already present).

Register in an MCP client (e.g. `.mcp.json` / Claude Code):

```json
{
  "mcpServers": {
    "api-testing-platform": {
      "command": "/Users/aniketmodi/Desktop/venv/bin/python3",
      "args": ["-m", "mcp_server"],
      "cwd": "/Users/aniketmodi/Desktop/api_testing/backend",
      "env": {
        "PLATFORM_BASE_URL": "http://localhost:8000",
        "PLATFORM_EMAIL": "<email>",
        "PLATFORM_PASSWORD": "<password>"
      }
    }
  }
}
```

## End-to-end workflow (call order)

1. `login` (implicit on first call)
2. `list_workspaces` → pick `workspace_id`
3. `sync_project(workspace_id, items[])` — mirror target project tree + APIs + cases in one call (fallbacks: `ensure_folder` → `create_api_file` → `save_api_request` → `save_cases_bulk`)
4. `create_environment` / `set_environment_variables` — **ask the user** for base URL, token, username values
5. `resolve_variables` (sanity-check `{{VARS}}` resolve)
6. `run_file_cases` / `run_bulk` → per-case verdicts + reconcile hints
7. Reconcile each failure: target-API bug → report; expected-block bug → fix case via `save_cases_bulk`; re-run
8. `compare_changes` on subsequent syncs to detect added/removed/renamed target routes
9. `export_results_table` → agent publishes markdown/Confluence content via its Atlassian tools (`diff_runs` for scheduled-run regression diffs)
