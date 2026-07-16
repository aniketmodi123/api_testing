# ApiPilot Test Workflow (source of truth — "this side")

## HOW TO READ THIS FILE (normative language)
- **MUST / NEVER / PROHIBITED** — binding. No exceptions, no judgment call. Violating one of these
  is a pipeline failure even if the tests pass.
- **SHOULD / DEFAULT** — do this unless there is a concrete reason not to; when deviating, state
  the deviation and the reason in the report.
- **MAY / OPTIONAL** — allowed, agent's judgment.
- A rule tagged **[BR-1]** / **[BR-2]** anywhere below is a reference to the boundary rules right
  under this section — the reference and the rule are the SAME rule, not two rules.

## CRITICAL BOUNDARY RULES (MANDATORY)
1. **[BR-1] No direct database access.** The agent MUST NOT execute raw database queries, write SQL
   scripts, or connect to any database by any means — including (not limited to) `psql`, Python DB
   drivers, `docker exec` into a DB container, ORM sessions in ad-hoc scripts, or admin UIs. This
   covers PostgreSQL/Aiven/local — any DB, any environment. The agent operates ONLY at the API
   layer: reading handler code, FastAPI schemas, routers, request/response models, and executing
   HTTP requests via the MCP tools. There is no "read-only exception" — a SELECT is as prohibited
   as a DELETE.
2. **[BR-2] No guessed identifiers.** The agent MUST NOT guess, invent, or probe for values that
   must already exist in the DB (`site_id`, `feeder_id`, `project_id`, `sc_no`, etc.). Every such value MUST
   be persisted to `apipilot.sample_data.json` immediately upon discovery or input. If the agent needs
   a value and it is not in the file, the agent MUST explicitly ask the user for it. Bypassing the file or using
   temporary in-context values without persisting them to `apipilot.sample_data.json` is strictly prohibited.

Scattered reminders below cite [BR-1]/[BR-2] — they repeat the rule for safety after context
compaction; the wording HERE is authoritative if any reminder reads differently.

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
- **Sample-data store (agent-only, gitignored, survives session changes): `apipilot.sample_data.json`
  at the target project root.** Scope-keyed store of ONLY the UNGUESSABLE params/body values a run
  needs — ANY value that must already exist in the DB and cannot be invented by the agent (opaque
  recorded ids, natural keys, references — e.g. `project_id`, `feeder_id`, `site_id`, `sc_nos`, but the
  rule is the TEST not the name: could the agent plausibly invent it? no → it belongs here). Arbitrary
  shape, nesting allowed. One top-level key per scope
  (folder-subtree / project); each holds an arbitrary `{key: value}` fixture. Data-only — auth/identity
  stay in env vars, never here. **Do NOT store structurally-obvious values** — `year`, `month`, `date`,
  `page`, `limit`, booleans, known enums: the agent generates those itself per case (a sensible current/
  recent value), so they are never stored and never asked. The fixture exists only for values a human/DB
  is the sole source of. MUST be in the target project's `.gitignore` — add the entry if missing.
  Agent-only; never commit it; never ask the user to hand-edit it. READ + SHOW + CONFIRM at session
  start (see Step 1.5): this is the durable home for the "ASK ONCE, THEN PERSIST" data values, and the
  per-run confirmation is what refreshes stale ids. Distinct from `apipilot.state.json` (run ledger).
- **Pipeline state (agent-only, survives session changes): `apipilot.state.json` at the target project
  root.** Holds `undo_map` (scan result + built_at), `pending_cleanups` (write-ahead log), `orphans`
  (until user deletes), and `progress` (per-endpoint run ledger — see Step 1.5). MUST be in the target
  project's `.gitignore` — add the entry if missing. Not for the user; never ask them to edit it.
  READ IT FIRST at session start: `pending_cleanups` non-empty → a previous session died mid-pair —
  run those inverse calls BEFORE any new work; `undo_map` fresh (definition: every route source file
  in the scanned scope has an mtime older than `built_at` — one changed file means STALE, rebuild)
  → reuse instead of re-scanning;
  `orphans` → re-list in every report; `progress` → skip any endpoint already `judged`, resume at the
  first non-judged, and never re-fetch one already at `cases_saved` or later.

## Pipeline

### 1. Auth + discover
- `mcp__apipilot__login` — confirm server + creds live; abort with a clear message on failure.
- `mcp__apipilot__list_workspaces` — resolve target workspace (ask user if ambiguous).
- `mcp__apipilot__get_workspace_tree` — existing folder/api layout = the mirror target.

### 1.5 Plan the run — census, group, order, gate, ledger (do this BEFORE fetching any body)
This step exists so a big scope (a whole `src/routers`) does not burn tokens in a flat per-API loop.
Nothing heavy (`get_api`, handler reads, case-gen) happens until the plan is set and — when large —
confirmed.
- **Cheap census (NO `get_api` yet):** `list_apis` over the scope subtree — collect only
  name + method + url per endpoint. Count endpoints, classify each by method. This is names-only, near-zero token.
- **Group the endpoints:**
  - All GET / read endpoints → ONE `reads` group (order-independent, safe to batch).
  - Write endpoints (POST/PUT/PATCH/DELETE) → group BY RESOURCE/MODEL. Reuse the same resource key the
    write-scan/undo-map uses (Step 3 — it matches inverses on resource, not filename): every endpoint
    acting on resource X (create/read/update/delete) is ONE `crud:<resource>` group, so its undo pair,
    self-restore, and any server-generated-id flow all stay inside a single group.
- **Run order:** the `reads` group first (no side effects) → then each `crud:<resource>` group in
  create → read → update → delete order (forward + inverse files together, as Step 6 requires).
- **Sample-data: load → show → confirm (MANDATORY, do this as part of the plan before case-gen):**
  1. The agent MUST read `apipilot.sample_data.json` for the active scope key at the start of the run.
  2. The agent MUST NOT bypass this file. Using temporary in-context values (e.g. extracted from active logs, code, or previous API responses) without writing them to this file is strictly prohibited.
  3. If a required value is missing or stale, the agent MUST stop and ask the user to provide it.
  4. If the agent ever discovers or derives a valid ID (either from user input or from a successful API response), it MUST immediately write it back to `apipilot.sample_data.json` using the file modification tools so it survives session switches and context compactions.
  5. Ensure `apipilot.sample_data.json` is added to the target project's `.gitignore` (add it if missing).
- **Extract the value keys to guide the ask (names-only, cheap):** collect the params/body keys each
  endpoint needs a concrete value for, then SPLIT them: (a) structurally-obvious keys (`year`, `month`,
  `date`, `page`, `limit`, booleans, known enums) — the agent fills these itself, never ask/store;
  (b) unguessable keys (opaque recorded ids) — these are the fixture keys. Only (b) goes to the user.
  During the census this can come from the endpoint's declared params/url; deepen from `get_api` +
  handler when a group is fetched. Present the UNION of unguessable keys — each with which endpoints use
  it and any value already in the fixture — as a single fill-in form. The user fills the whole set ONCE,
  carefully; this is the front-load that stops per-API interruptions (on a multi-API run the user
  forgets values asked one at a time). [BR-1]/[BR-2]: this form is the ONLY source for unguessable
  values — never a DB query, never a probe.
- **GATE — stop and confirm before heavy work:** trigger when the scope has ANY write group, OR more
  than one resource group, OR more than 8 endpoints. On trigger, present the plan — the groups, the
  per-group endpoint count, the run order, and the batched value-key form above (folds together with
  Step 5's "BATCH THE ASKS") — then STOP and let the user confirm or subset. A small
  pure-read scope under the trigger proceeds without asking. Never call `get_api` before the plan is
  confirmed on a gated scope.
- **Progress ledger (`progress` in `apipilot.state.json`) — makes the run resumable:** one entry per
  endpoint `{endpoint, group, status: pending | cases_saved | run | judged}`. Advance the status after
  each stage completes. At session start / after compaction, read the ledger FIRST: skip anything
  `judged`, resume at the first non-judged endpoint, and NEVER re-fetch an endpoint already at
  `cases_saved` or later. This is what stops a compacted big run from re-discovering and re-fetching.
- **Process ONE group fully before the next** (fetch → generate → save → run → judge → report), so
  main context only ever holds the active group. Cases are stored server-side and the ledger is on
  disk, so both survive compaction — that is the token-safety guarantee.
- **Subagent delegation is OPTIONAL:** for a very large write group, per-file case-gen MAY be handed
  to a subagent to keep main context lean — but a subagent cold-starts and usually costs MORE total
  tokens, so the DEFAULT is main-thread group-checkpointing. Delegate only when the group is big
  enough that context bloat outweighs the cold-start.

### 2. Load case-gen prompt FRESH
Read `gpt_test_case_creatio_prompt.txt` in full. Its rules are authoritative for case shape,
`expected` blocks, coverage, and the extra normal-case variables at its bottom. Never reproduce from memory.

### 3. Per API — fetch + generate (ONE group at a time, per Step 1.5)
Fetch bodies and read handlers ONLY for endpoints in the group currently being processed — never
`get_api` the whole scope upfront. Advance each endpoint's `progress` status as you go.
- `mcp__apipilot__get_api` — method, url, headers, params, body.
- Read the matching handler in the CURRENT project's source — learn real success/error response shapes,
  status codes, validation fields. Grounds `expected` in reality.
- **WRITE-API SCAN + UNDO MAP (once per scope, BEFORE generating any write case):** if the scope
  contains any POST/PUT/PATCH/DELETE, scan ALL routes in the scope subtree AND sibling folders
  (source files + `list_apis`) and classify each: `read / create / update / delete / assign /
  unassign / record-only`. Build the undo map by pairing inverses — create↔delete, assign↔deassign,
  activate↔deactivate, add↔remove (match on resource, not filename). The undo often lives in a
  DIFFERENT folder — that is exactly why the scan covers siblings, and why generating "one API at a
  time" without this map produces junk data. No inverse in the scope? WIDEN the scan to the whole
  project's routes before declaring `no undo exists` — CRUD for one resource is often split across
  folders (create here, delete elsewhere). No inverse found → record `no undo exists` explicitly
  for that API; the prompt's no-undo ladder then applies. Persist the finished map into
  `apipilot.state.json` (`undo_map` + `built_at`); at session start reuse it when fresh (source files
  unchanged) instead of re-scanning.
- **Feed the map into generation:** for every write endpoint, the gen input must carry its operation
  kind, its inverse endpoint (or `no undo exists`), the SHARED fixed fake test values for the pair
  (`apipilot_test_` prefix; fake mobiles `90000000xx`; emails `@example.com` — never real PII), and
  for updates the record's original values so the file can self-restore — obtain them via the
  resource's READ endpoint (GET) before generating; never from the DB ([BR-1]).
- **Split the generation work (token diet):** call `mcp__apipilot__generate_standard_cases` FIRST —
  it mechanically expands and saves the standard negative matrix (401 auth, per-field
  missing/empty/whitespace/wrong-type) server-side and returns only names. Then hand-write ONLY the
  interesting cases (happy path, 206/404 data-state, boundaries, 409s, business logic). Never
  hand-write a case whose name starts with "[std] ".
- Generate the remaining interesting case set applying the Step-2 prompt. Exact JSON array shape, no markdown.

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
  A VALID data value that must exist in the DB (`site_id`, `feeder_id`, `sc_no`) is still a literal.
  Its durable home is the per-scope fixture in `apipilot.sample_data.json` (Step 1.5), confirmed with
  the user each run — pull the literal from there. Value not in the fixture → the agent MUST ask the
  user via the batched form ([BR-2]; DB queries/probes prohibited per [BR-1]). A guessed id / an
  unconfigured `{{site_id}}` (sent as literal text) matches nothing → 206 on every case. This is the
  #1 observed bug.
- **HARD GATE — never emit or run an unconfigured `{{var}}`:** before producing a case that references
  a variable, that variable MUST already exist in the active env. If not, STOP and ask the user for its
  value, then `set_environment_variables` BEFORE writing the case. An unconfigured `{{var}}` runs as the
  literal text `{{token}}`/`{{site_id}}` → wholesale failure; that is a variable bug, not an API bug.
- **PREFLIGHT before every run:** enumerate every `{{var}}` used across the cases about to run;
  `list_environments`/`resolve_variables` to confirm the active env defines all of them; any missing →
  STOP, ask, set, then run. Never run with an unresolved variable.
- **BATCH THE ASKS (one message, not five):** after the Step-3 scan the agent knows EVERY value the
  whole scope needs — valid ids, sample payload fields for write APIs, personas. Collect
  them into ONE question to the user BEFORE generating/running anything; never interrupt mid-run for
  a value the scan could have predicted. Answers that are shared auth/identity → env vars; per-resource
  sample payload / data values → literals in cases, persisted to the scope's fixture in
  `apipilot.sample_data.json` (Step 1.5) so later runs reuse them. Unguessable IDs/values come from
  the user only ([BR-2]); DB queries/probes prohibited ([BR-1]).
  Mid-run asks are allowed ONLY for a genuine single-API one-off the batched form could not predict;
  everything reused across APIs must have been collected in the Step 1.5 form.
- **ASK ONCE, THEN PERSIST:** if a needed value is not already stored, ask the user once, then store it
  in its durable home so that user is never asked again — auth/identity → env vars via
  `set_environment_variables` (a known-good value plus a known-bad one for the not-found test);
  params/body data values → the scope fixture in `apipilot.sample_data.json`. Once stored, reuse across
  all later cases, APIs, and sessions. The active environment is the durable store for `{{var}}`s; the
  sample-data file is the durable store for literal data values.
- **Ground data values in reality:** the case-gen prompt's old hardcoded site/sc lists
  went stale (all 206). Valid IDs come from the user-confirmed sample-data fixture, nowhere else
  ([BR-1]/[BR-2]).
- **Expected blocks are NOT variable-resolved** — the runner substitutes `{{var}}` only in
  headers/params/body. When a param is `{{site_id}}`, assert `present`/`type`, never `equals "<literal>"`.
- Read `apipilot.vars.json` at target project root if present. Token validity is VERIFIED, not
  guessed: run ONE cheap authed GET through the target (any known read endpoint) before the first
  batch; 401 → the token is dead — ask the user for a fresh one, update the env, re-verify.
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
  (This docker exec is an HTTP connectivity check against the API — it is NOT DB access and does
  not violate [BR-1].)
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
- **Write-pair run order (default):** a forward write file does not run alone — its inverse file runs
  immediately after in the same batch (assign file → deassign file; create file → delete file). The
  inverse file's success case IS the cleanup (same shared fixed values). Update files self-restore via
  their last case, so they may run standalone. Read-only files run in any order.
- **Deferred pair-closing (interleaved / cross-session CRUD):** when the inverse is planned LATER —
  create tested now, update/delete tested at the end, other APIs in between — running forward alone is
  ALLOWED, provided the cleanup entry sits in `pending_cleanups` the whole time. The created marker
  record deliberately stays alive as the working record for the middle tests (reads, updates). Every
  report in between lists it under "pending cleanup — test record still in DB". The chain closes when
  the delete/inverse file finally runs; a session may end with pending entries (not a failure — the
  next session sees them and either continues the chain or closes it). Only an entry nobody can ever
  close becomes an orphan.
- **Full CRUD set (4 endpoints, one resource):** run order is create → read → update → delete. The
  create file's 2xx case makes the shared test record (marker values); read + update cases target that
  record (update self-restores); the delete file's 2xx case removes it — delete IS the pair-closer for
  create. The record exists only inside the batch window, so a full green run leaves zero rows. The
  delete file additionally keeps its safe standalone cases (404 on nonexistent id, 401/422).
  When the chain depends on a server-generated id, model the happy-path chain as a FLOW instead (see
  server-generated-ids bullet) — per-endpoint negative cases still live in the case files.
- **Write-ahead the cleanup (crash safety):** BEFORE running a forward write file, append its planned
  cleanup to `pending_cleanups` in `apipilot.state.json` (endpoint, values, inverse). Remove the entry
  only AFTER the inverse succeeds. Inverse fails or session dies → the entry survives; the next
  session runs it first (see Fixed paths). Cleanup that can never succeed → move the entry to
  `orphans`.
- If the forward file ran but the inverse file failed or was skipped, treat every 2xx write from the
  forward file as orphaned data for Step 8 — do not end the session without reporting it.
- **Server-generated ids — use a FLOW (server-side chaining):** when the undo needs an id the server
  invented (create returns `data.id`), model the chain as a flow — `list_flows` first (reuse), then
  `create_flow` with ordered request steps: create (`extract: {"created_id": "$.data.id"}`) →
  update/read (config params/body reference `{{created_id}}`) → delete (`{{created_id}}`). `run_flow`
  executes the whole chain server-side and returns per-step results — no agent turn-by-turn chaining,
  and a manual UI re-run stays id-safe because the server re-extracts a fresh id every run. Step
  `api_id` is the Api row id from `get_api`, NOT the file_id; request steps do not assert status —
  check each step's `response.status_code` in the run result, or add condition steps to stop early.
  Prefer natural-key undo (username+feeder_id) when the inverse endpoint accepts it — then plain
  case files + pair run order suffice, no flow needed. Agent-side chaining via `update_case` remains
  a fallback for one-off repairs only.

### 7. Judge every mismatch (the important part)
- **SYSTEMIC TRIAGE FIRST — before judging any single case:** when a large share of a run fails with
  ONE shared signature ("Invalid token" everywhere / every case 206 / "All connection attempts
  failed" / literal `{{...}}` visible in a request), the cause is a variable/env/connectivity/gateway
  problem, not dozens of API bugs. STOP judging, run the Step-5 preflight checks (active env, var
  resolution, token verify, docker URL), fix the systemic cause, RE-RUN, and only then judge what
  still fails. Judging cases one-by-one under a dead token is the known token-burner failure.
- **Decision procedure per mismatch (evidence order — the handler code is the tiebreaker):**
  1. Read the handler code for the exact path taken (plus the gateway allowlist when fronted).
  2. Response agrees with what the code actually does → **expected-bug**.
  3. Response contradicts the code, or the code itself violates the platform contract (envelope,
     `response_code` mirror, safe error messages) → **API-bug**.
  4. Code ambiguous / contract genuinely unclear → ask the user. Never guess a bucket — a wrong
     bucket either ships a broken API or rots a good test.
  What "usually" APIs do and what the test's author intended are NOT evidence; the code is.
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
**Grounding data must be real + current:** the case-gen prompt's site_id/sc_no lists went
stale — every id returned 206. Rely entirely on the user-confirmed values in
`apipilot.sample_data.json` ([BR-1]/[BR-2]: no DB checks, no docker-exec record queries).

### 8. Export
`mcp__apipilot__export_results_table` with a clear title → reconcile table for Confluence/docs.
Summarise: total cases, pass/fail, count of API-bugs vs expected-bugs, list of proposed fixes awaiting approval.
- **Orphan report (MANDATORY when any write ran):** list every 2xx write whose undo did NOT execute —
  cases named " [ORPHANS DATA]", forward files whose inverse failed/skipped, no-undo creates. For each:
  endpoint, table, identifying values (the `apipilot_test_` markers), and the explicit line
  "no delete API exists — remove these yourself". Zero leftovers → state "DB left as found". Never end
  a run silent about data it created. Orphans persist in `apipilot.state.json` and are re-listed in
  EVERY report until the user confirms deletion — only then remove them from the file.

## Rules
- Read this file + the case-gen prompt fresh every run — both are the volatile source of truth.
- Idempotent: re-run must not duplicate the tree. If ApiPilot renames duplicates, stop + report.
- Never hardcode a VALID token or any real PII — valid shared credentials live in env variables
  only. (Deliberately-INVALID tokens in negative cases are the one exception: those are static
  literals by design, per Step 5.)
- Write APIs: the run leaves the DB as it found it, or the report names every leftover row. Fake data
  only in write payloads — `apipilot_test_` prefix, fake mobiles, `@example.com` emails; a real mobile
  number can fire a real SMS/OTP.
- Step 7 = judgment: classify, propose, wait. Two directions (fix API / fix expected), never a silent third.
- Report honestly — if the run had failures, say so with numbers; don't declare green early.
- **No custom formatting scripts:** Never write custom Python, Node.js, or shell scripts to parse, extract, or format test results. Always use the built-in `export_results_table` tool on the `reconcile` output to get the Markdown/XHTML table, and present it directly or use Confluence tools to publish.

## SAMPLE DATA DIRECTORY & PERSISTENCE PROTOCOL

1. **Parameter Resolution**: When the agent reads the FastAPI handler code and identifies unguessable request parameters (such as `sc_no`, `feeder_id`, `project_id`, `site_id`, etc.), it MUST look up the values directly in the project root's `apipilot.sample_data.json` file.
2. **Strict Persistence**: Under no circumstances should the agent use temporary or in-context IDs without immediately writing them back to `apipilot.sample_data.json` using the file modification tools so that they survive session switches.
3. **No Guessing**: If a required database identifier is missing from `apipilot.sample_data.json` and cannot be found in the current environment configuration, the agent MUST stop and ask the user to provide it.

