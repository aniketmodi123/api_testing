# ApiPilot Test Workflow (source of truth — "this side")

This file owns the WORKFLOW. `gpt_test_case_creatio_prompt.txt` owns the CASE SHAPE.
Both live in this project so they stay editable here. The global `/apipilot-test` skill is a thin
runner that reads THIS file + the prompt file fresh every run, then executes. Edit here, not in the skill.

Run the pipeline FROM the project under test (mes_sso, mes_mdms, ...) — that project holds the real
API code. Cases are stored into ApiPilot through the `mcp__apipilot__*` MCP tools.

## Fixed paths
- Case-gen prompt (VOLATILE — read fresh every run):
  `/Users/aniketmodi/Desktop/api_testing/backend/gpt_test_case_creatio_prompt.txt`
- This workflow (VOLATILE — read fresh every run): this file.
- Per-project vars: `apipilot.vars.json` at the target project root (optional).

## Pipeline

### 1. Auth + discover
- `mcp__apipilot__login` — confirm server + creds live; abort with a clear message on failure.
- `mcp__apipilot__list_workspaces` — resolve target workspace (ask user if ambiguous).
- `mcp__apipilot__get_workspace_tree` — existing folder/api layout = the mirror target.

### 2. Load case-gen prompt FRESH
Read `gpt_test_case_creatio_prompt.txt` in full. Its rules are authoritative for case shape,
`expected` blocks, coverage, and the extra normal-case variables at its bottom. Never reproduce from memory.

### 3. Per API — fetch + generate
- `mcp__apipilot__get_api` — method, url, headers, params, body.
- Read the matching handler in the CURRENT project's source — learn real success/error response shapes,
  status codes, validation fields. Grounds `expected` in reality.
- Generate max reasonable case set (10-15+) applying the Step-2 prompt. Exact JSON array shape, no markdown.

### 4. Mirror tree + store — CHECK-FIRST, reuse before creating (match by ENDPOINT, not by name)
Recreate the project's folder→api structure in ApiPilot (same as Postman layout). Identity of an API is
its **endpoint = method + url**, NOT its filename. ALWAYS read the existing tree first
(`get_workspace_tree` / `list_apis` + `get_api`) and reuse what is already there — only build what is missing.

**Path A — nothing exists yet (build from scratch):** create the whole chain top-down —
`mcp__apipilot__ensure_folder` for each folder in the path → `mcp__apipilot__create_api_file` (name =
source tree) + `save_api_request` for the endpoint → `mcp__apipilot__save_cases_bulk` for the cases.

**Path B — it already exists (reuse the existing one first):** do NOT recreate.
- Folder already present → `ensure_folder` returns it; reuse (no duplicate).
- File whose endpoint (method + url) matches:
  - **same name** → reuse it; refresh the request via `save_api_request`.
  - **different name** → reuse the SAME file (never duplicate). Rename toward the source-tree name with
    `mcp__apipilot__rename_node` (fails if that name is already taken in the folder → keep existing name,
    note the diff).
- Cases already present → `list_cases` first; add only the missing ones via `save_cases_bulk`. Do not
  duplicate cases that already cover the same assertion.

Rule of thumb: reuse folder/file/cases that exist; create only the gaps. Keep names identical to the
source tree, diverging only when an existing endpoint file forces it (then rename toward source when possible).

### 5. Variables (env-backed, ask once, persist forever)
CORE RULE: `{{var}}` is ONLY for a value SHARED ACROSS MULTIPLE APIs. Single-case / single-API value →
plain literal, never a variable (see the case-gen prompt's VARIABLES section).
- **Shared auth/identity** (token, username, usertype, devurl) → env vars, referenced `{{var}}` in
  folder/file/case headers. THIS IS THE MAIN USE. **Personas in one env:** admin `{{token}}`/
  `{{username}}`/`{{usertype}}` + consumer `{{consumer_token}}`/`{{consumer_username}}`/
  `{{consumer_usertype}}` (consumer keys carry `consumer`). A case acting as a persona references that
  persona's var. INVALID values (bad/expired/tampered token, wrong role) → static LITERAL in that one
  case, never a variable.
- **Params & body → ALWAYS LITERAL. Never a `{{var}}`.** The concrete value a case tests goes inline.
  A VALID data value that must exist in the DB (`site_id`, `feeder_id`, `sc_no`) is still a literal —
  GROUND it: query the target DB (`docker exec <svc>_dev python -c "...SELECT ...LIMIT"`) for a value
  that returns rows, inline it. A guessed id / an unconfigured `{{site_id}}` (sent as literal text)
  matches nothing → 206 on every case. This is the #1 observed bug.
- **HARD GATE — never emit or run an unconfigured `{{var}}`:** before producing a case that references
  a variable, that variable MUST already exist in the active env. If not, STOP and ask the user for its
  value, then `set_environment_variables` BEFORE writing the case. An unconfigured `{{var}}` runs as the
  literal text `{{token}}`/`{{site_id}}` → wholesale failure; that is a variable bug, not an API bug.
- **PREFLIGHT before every run:** enumerate every `{{var}}` used across the cases about to run;
  `list_environments`/`resolve_variables` to confirm the active env defines all of them; any missing →
  STOP, ask, set, then run. Never run with an unresolved variable.
- **ASK ONCE, THEN PERSIST:** if a needed value is not already an env var, ask the user once (a
  known-good value, plus a known-bad one for the not-found test), store with `set_environment_variables`.
  The person running this MCP is served by their OWN agent — once stored, never ask that user again;
  reuse the stored env var across all later cases and APIs. The active environment is the durable store.
- **Ground data values in reality (proven live):** the case-gen prompt's old hardcoded site/sc lists
  went stale (all 206). Before storing a "known-good" value, confirm it has rows —
  `docker exec <svc>_dev python -c "...SELECT ... LIMIT 5"` (use the ORM model's real `__tablename__`).
- **Expected blocks are NOT variable-resolved** — the runner substitutes `{{var}}` only in
  headers/params/body. When a param is `{{site_id}}`, assert `present`/`type`, never `equals "<literal>"`.
- Read `apipilot.vars.json` at target project root if present; likely-expired token → ask user.
- Push with `mcp__apipilot__set_environment_variables`; verify with `mcp__apipilot__resolve_variables`.
- **UI parity (proven live):** because all shared values live in the ACTIVE environment, the user's
  manual bulk-run in the ApiPilot UI resolves the exact same values and shows the exact same pass/fail
  the agent reported. Keep every reusable value in the env (not hardcoded) so agent runs and UI runs
  never diverge — that is how the user visually confirms a green run.
- **Docker gotcha (proven live):** the ApiPilot backend runs inside Docker — a base URL of
  `127.0.0.1:<port>` resolves to the CONTAINER, not the host, and every case fails with
  "All connection attempts failed". For services on the host machine use
  `http://host.docker.internal:<port>` in the URL variable. Verify before running:
  `docker exec apipilot curl -s -o /dev/null -w "%{http_code}" <resolved-url>`.
- **Runs use the ACTIVE environment (proven live):** there is no per-run environment override —
  if the user switches the active env mid-session (UI), the next run resolves against THAT env and
  vars like `token` silently go out as literal `{{token}}` → mass "Invalid token" failures.
  Before every run: `list_environments`, confirm the active env has every var the cases need.
- **Environments are personas (user's Postman model):** the user keeps one env per persona —
  own / admin / consumer / test / false-data. Never overwrite a user-owned env (e.g. `mes`);
  put pipeline vars in a pipeline/persona env (e.g. `test`) and activate it for the run.
  `set_environment_variables` is REPLACE-ALL — always send the full dict.

### 6. Run
`mcp__apipilot__run_file_cases` per file (or `mcp__apipilot__run_bulk` for a batch). Capture each
case's actual status + body + pass/fail of its `expected` assertions.

### 7. Judge every mismatch (the important part)
For each case where `expected` does NOT match the response, classify into exactly ONE bucket + act:
- **API-bug** — response wrong (wrong status/envelope/missing field/bad message). → API must change.
  Point to exact handler file:line in the current project, describe correct behaviour, propose the code
  fix. Wait for approval — never edit silently.
- **expected-bug** — response correct, `expected` wrong (bad assertion / wrong status_in / wrong path).
  → The stored case must change. Propose corrected `expected`; on approval repair IN PLACE via
  `mcp__apipilot__update_case` (keeps the case id — never delete + recreate; `save_cases_bulk` only
  creates and rejects duplicate names). `mcp__apipilot__delete_case` is only for true duplicates or
  cases that no longer apply.
Never loosen an assertion to force a pass — that masks API-bugs. State the bucket + why per mismatch.
Ambiguous → ask the user.
Gateway-fronted targets: negative cases must expect the GATEWAY's behavior, not the service's — e.g.
a missing required header may die at the gateway as 401 `{"detail": ...}` before the service's own
422 validation is ever reachable. Ground negative expectations in a real probe, not the service code alone.
**Auth is per-route, not global (proven live):** the gateway keeps a `skipUrls.json` allowlist — routes
on it (e.g. `/sc-no`) are PUBLIC: bad/missing token still returns 200/206 data. Before writing 401
cases, probe the route with a junk token; if it still serves data, the route is public — assert the
public contract, and if that surprises the user, ask (it may be an intended public route or a real hole).
**Grounding data must be real + current (proven live):** the case-gen prompt's site_id/sc_no lists went
stale — every id returned 206. Query the TARGET service's DB for a live id with rows before asserting a
200 body: `docker exec <svc>_dev python -c "...SELECT ... LIMIT 5"` (use the ORM model's real
`__tablename__`, not the class name).

### 8. Export
`mcp__apipilot__export_results_table` with a clear title → reconcile table for Confluence/docs.
Summarise: total cases, pass/fail, count of API-bugs vs expected-bugs, list of proposed fixes awaiting approval.

## Rules
- Read this file + the case-gen prompt fresh every run — both are the volatile source of truth.
- Idempotent: re-run must not duplicate the tree. If ApiPilot renames duplicates, stop + report.
- Never hardcode tokens/PII — variables only.
- Step 7 = judgment: classify, propose, wait. Two directions (fix API / fix expected), never a silent third.
- Report honestly — if the run had failures, say so with numbers; don't declare green early.
