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

### 5. Variables (config + ask fallback)
token / username / vertical / user-type / site_id / sc_no must be filled, never hardcoded.
- Read `apipilot.vars.json` at target project root if present.
- Honour the extra variables block at the bottom of the case-gen prompt (site_id / sc_no lists).
- Missing OR likely-expired (token) → ask user (AskUserQuestion).
- Push with `mcp__apipilot__set_environment_variables`; verify with `mcp__apipilot__resolve_variables`.

### 6. Run
`mcp__apipilot__run_file_cases` per file (or `mcp__apipilot__run_bulk` for a batch). Capture each
case's actual status + body + pass/fail of its `expected` assertions.

### 7. Judge every mismatch (the important part)
For each case where `expected` does NOT match the response, classify into exactly ONE bucket + act:
- **API-bug** — response wrong (wrong status/envelope/missing field/bad message). → API must change.
  Point to exact handler file:line in the current project, describe correct behaviour, propose the code
  fix. Wait for approval — never edit silently.
- **expected-bug** — response correct, `expected` wrong (bad assertion / wrong status_in / wrong path).
  → The stored case must change. Propose corrected `expected`; on approval re-save via `save_cases_bulk`.
Never loosen an assertion to force a pass — that masks API-bugs. State the bucket + why per mismatch.
Ambiguous → ask the user.

### 8. Export
`mcp__apipilot__export_results_table` with a clear title → reconcile table for Confluence/docs.
Summarise: total cases, pass/fail, count of API-bugs vs expected-bugs, list of proposed fixes awaiting approval.

## Rules
- Read this file + the case-gen prompt fresh every run — both are the volatile source of truth.
- Idempotent: re-run must not duplicate the tree. If ApiPilot renames duplicates, stop + report.
- Never hardcode tokens/PII — variables only.
- Step 7 = judgment: classify, propose, wait. Two directions (fix API / fix expected), never a silent third.
- Report honestly — if the run had failures, say so with numbers; don't declare green early.
