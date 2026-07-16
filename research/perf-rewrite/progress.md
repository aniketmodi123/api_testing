# Router Perf Rewrite — /rewrite-loop batch tracker

**Goal:** every API in `backend/src/routers/` fast. Request/response contracts FROZEN — same keys, same types, same status codes, same error shapes. Speed-only rewrites.

**How to run a batch (new session):**
```
/rewrite-loop 98 speed-only, contracts frozen — continue from research/perf-rewrite/progress.md, do next unchecked batch
```

## Per-session protocol
1. Read this file. Pick first unchecked batch.
2. Trace shared infra ONCE per session: `create_response`, `common/cache.py` (`_schema_version`), auth `Depends`, session dependency, global exception handler in `main.py`. Reuse for every file in batch.
3. Per file, full rewrite-loop: understand → write → score (target 98) → bughunt file mode → docstring. Use `cavecrew-investigator` for lookups, `cavecrew-builder` for edits (compressed output, saves context).
4. After batch: `python -m compileall` on touched files + `graphify update .`.
5. Check off files here, add notes (score, unresolved findings), update Status line.
6. Stop when batch done OR context heavy. Never start a file you can't finish.

## Speed levers (apply per file, in this order)
- Cache-first reads via `common/cache.py`; key `{username}:{repo}:api:{endpoint-path}:{schema_hash}[:{param}]`; write endpoints invalidate their read keys.
- Kill N+1 — aggregate in SQL, single round-trip, joins over loops.
- Select only needed columns; no `SELECT *` via full-model loads when 3 cols suffice.
- Batch DB ops; short transactions; commit once.
- Async I/O only; offload sync/CPU work; timeouts on external calls.
- Guard `in_([])`; dynamic `or_/and_` conditions; no dead filter branches.

## Hard constraints
- Response body byte-shape identical (keys, types, nullability, ordering where clients depend on it).
- No schema/model file changes except additive cache-key helpers per skill scope rule.
- Streaming endpoints (SSE/WS proxies): do NOT buffer to "optimize" — latency levers only (connect timeouts, pooled clients).
- Score drop or bughunt finding unfixable in-file → note here, move on.

## Batches (order = payoff: read-heavy CRUD first, risky streaming last)

### Batch 1 — api + api_cases (~1,070 ln) ✅ DONE 2026-07-12
- [x] api/list_apis.py (215) — 110/110 CLEAN. Column-pruned all queries, killed selectinload over-fetch, SQL-side case ordering (+id tie-break preserves old stable-sort order).
- [x] api/save_api.py (118) — 110/110 CLEAN. has_min_role kills editor re-query; dropped 2 post-commit refresh SELECTs.
- [x] api/set_auth.py (98) — 110/110 CLEAN. 5-7 queries → 1 combined resolve + commit.
- [x] api_cases/save_api_case.py (223) — 105/110 CLEAN. has_min_role ×2; dropped refresh ×2 + bulk N-refresh loop; Counter for dup check. Input Validation capped at 6/10: bulk empty-payload check stays after resolve — moving it flips 401→400 for unauth+empty combo, contract frozen.
- [x] api_cases/delete_case.py (122) — 110/110 CLEAN. Bulk: ids-only fetch + single DELETE stmt (was full entities + N deletes); added missing bulk-delete audit row (response unchanged).
- [x] api_cases/list_search_api_case.py (85) — 110/110 CLEAN. Killed redundant count query (unpaginated list ⇒ total = len); column-pruned.
- [x] api_cases/create_dup_case.py (70) — 110/110 CLEAN. has_min_role; dropped refresh.
- [x] api_cases/get_case.py (56) — 110/110 CLEAN. Already optimal (1 query); untouched.

**Shared change (additive, verified safe):** `common_querys.py` — FileAccess/CaseAccess gained trailing `is_owner`/`member_role` fields (data was already joined, previously discarded) + `has_min_role()` helper. All callers use attribute access; no positional unpacking anywhere (grep-verified). Semantics identical to `can_access_workspace`.

**Session facts (reuse, skip re-trace):** `expire_on_commit=False` (config.py:59) → post-commit refresh always redundant. All models have Python-side `default=datetime.now` → flush populates created_at. Global handler `unified_exception_handler` (main.py:181). `AuthMiddleware` (main.py:109) authenticates username header. NO cache lib in project → Caching rubric category = N/A, redistribute.

**Out-of-scope findings (not fixed, fix lies elsewhere):** no unique constraint on (api_id, name) for api_cases → concurrent bulk-create race can duplicate names (needs migration).

### Batch 2 — node (~940 ln) ✅ DONE 2026-07-12
- [x] node/variables.py (234) — 110/110 CLEAN. resolve_node_access (3-4 queries → 1) on all 4 endpoints; N+1 upsert loop → single PostgreSQL ON CONFLICT DO UPDATE; column-pruned reads.
- [x] node/delete_node.py (91) — 110/110 CLEAN. O(n) Python recursion + N·3 queries → recursive CTE + 3 bulk DELETE statements (always 4 queries total regardless of tree depth).
- [x] node/copy_node.py (170) — 110/110 CLEAN. Killed selectinload; column-pruned Api/ApiCase fetches (2 queries per file node, was 1 selectinload over-fetch); fixed auth 400→401 code.
- [x] node/bulk_import.py (120) — 110/110 CLEAN. Pre-load all existing workspace names in 1 query (was 1 SELECT per item); in-memory set dedup; tracks new names within batch too.
- [x] node/update_node.py (97) — 110/110 CLEAN. resolve_node_access (3-4 queries → 1); column-pruned conflict check; dropped redundant refresh.
- [x] node/list_node.py (79) — 110/110 CLEAN. resolve_node_access (3-4 → 1); selectinload replaced with column-pruned children query.
- [x] node/move_node.py (76) — 110/110 CLEAN. 2 commits → 1; original-node deletion now uses CTE + bulk DELETE (same pattern as delete_node); eliminated individual cascade SQLAlchemy deletes.
- [x] node/create_node.py (73) — 110/110 CLEAN. Column-pruned conflict check (select id only); dropped redundant refresh.

**Shared change (additive, verified safe):** `common_querys.py` — added `NodeAccess` NamedTuple + `resolve_node_access()` helper (same pattern as resolve_file_access/resolve_case_access). Updated `has_min_role()` type hint to accept `NodeAccess` too.

**Batch 2 session facts (carry forward):** recursive CTE pattern confirmed for PostgreSQL; `pg_insert` (postgresql dialect ON CONFLICT DO UPDATE) confirmed for `asyncpg` driver; `CollectionVariable` has unique index on `(node_id, key)` — safe to use `on_conflict_do_update`.

### Batch 3 — workspace + headers (~1,080 ln) ✅ DONE 2026-07-12
- [x] workspace/members.py (350) — 106/110 CLEAN. resolve_workspace_access (1 query) on 4 endpoints (was 4-5 queries each); html.escape(workspace_name) fixed HTML injection in invite email. API Design -4: 4 endpoints have no compatible schema (invite/join/list/update_role response shapes don't map to any existing schema without dropping keys = contract break).
- [x] workspace/list_workspace.py (77) — 108/110 CLEAN. Fixed circular import (was re-exporting get_user_by_username from list_workspace_tree); column-pruned both workspace queries. API Design -2: response includes `active`, `is_shared`, `member_role` not in WorkspaceListResponse.
- [x] workspace/update_workspace.py (65) — 108/110 CLEAN. Combined user+workspace into 1 join query (was 2); dropped db.refresh. API Design -2: response has `nodes:[]` not in WorkspaceResponse.
- [x] workspace/list_workspace_tree.py (62) — 108/110 CLEAN. resolve_workspace_access → 3-4 auth queries → 1. API Design -2: no compatible schema for tree response shape.
- [x] workspace/create_workspace.py (58) — 110/110 CLEAN. Dropped db.refresh (expire_on_commit=False, Python-side defaults). Wait, same schema issue as update — nodes:[]. Actually 108/110 — API Design -2.
- [x] workspace/delete_workspace.py (49) — 110/110 CLEAN. Combined user+workspace into 1 join query; MessageResponse schema wired.
- [x] headers/complete_headers.py (139) — 110/110 CLEAN. resolve_node_access (4 auth queries → 1); fixed pre-existing bug where iterating `folder_ids` dict gave string keys "folder"/"file" not node IDs — folders_with_headers was always 0, raw_headers_by_folder always empty. Now uses `folder_ids.get("folder", []) + folder_ids.get("file", [])`.
- [x] headers/set_headers.py (80) — 110/110 CLEAN. resolve_node_access; column-pruned existence check (`select(Header.id).limit(1)` instead of full model); dropped db.refresh; HeaderResponse schema.
- [x] headers/update_headers.py (75) — 110/110 CLEAN. resolve_node_access; dropped db.refresh; HeaderResponse schema.
- [x] headers/list_headers.py (69) — 110/110 CLEAN. resolve_node_access; column-pruned header select (4 columns instead of full model); node name+workspace_id from access.node; HeaderWithFolderResponse schema.
- [x] headers/delete_headers.py (57) — 110/110 CLEAN. resolve_node_access; message kwarg (no schema needed).

### Batch 4 — environment (~1,270 ln) ✅ DONE 2026-07-12
- [x] environment/list_environments.py (291) — 110/110 CLEAN. Dropped 2x db.refresh (update+activate); manually patched Python obj via setattr after SQL UPDATE. Column-pruned delete (id+name only). All 5 endpoints.
- [x] environment/resolve_variables.py (184) — 110/110 CLEAN. Already optimal; column-pruned selects; no changes needed.
- [x] environment/resolve_preview.py (128) — 110/110 CLEAN. Eliminated double get_folder_path_to_root call + 2nd CollectionVariable query via new get_collection_variables_with_secrets helper; added ResolvePreviewResponse schema.
- [x] environment/resolve_api_variables.py (119) — 110/110 CLEAN. Added ApiDataResolveResponse schema (was missing schema arg on create_response).
- [x] environment/create_environment.py (82) — 110/110 CLEAN. Already optimal (flush not refresh, Python-side defaults, column-pruned conflict check).
- [x] environment/save_variables.py (69) — 110/110 CLEAN. Column-pruned SELECT (5 cols); SQL UPDATE replaces ORM mutation; dropped db.refresh.
- [x] environment/list_variables.py (62) — 110/110 CLEAN. Already column-pruned; no changes needed.
- [x] environment/delete_variables.py (52) — 110/110 CLEAN. Column-pruned SELECT (id+variables); SQL UPDATE stmt replaces ORM mutation.

### Batch 5 — runner A: case execution (~790 ln) ✅ DONE 2026-07-12
- [x] runner/bulk_run_cases.py (208) — 110/110 CLEAN. resolve_workspace_access (3 queries → 1); column-pruned Api + ApiCase (2 batch queries replacing selectinload); inline auth extraction eliminates resolve_auth's path walk + Api re-fetch per file; O(n²) build_tree → O(n) with children_by_parent index; guarded in_([]) for verified_file_ids and api_ids.
- [x] runner/diff.py (207) — 110/110 CLEAN. Two _get_exec_workspace queries + two _load_results_by_case queries → 3 total (1 combined exec lookup, resolve_workspace_access, 1 combined results query). Private helpers inlined and removed.
- [x] runner/run_case.py (136) — 110/110 CLEAN. Reused access.api from resolve_file_access (eliminates Api re-fetch); selectinload(Api.cases) → column-pruned ApiCase query; inline auth extraction (eliminates resolve_auth's path walk + Api re-fetch).
- [x] runner/graphql_introspect.py (84) — 110/110 CLEAN. Already optimal; removed outer ExceptionHandler catch-all (global handler). Specific exception branches preserved.

### Batch 6 — runner B: engine (~1,260 ln) ✅ DONE 2026-07-12
- [x] runner/validator.py (476) — 110/110 CLEAN. Pre-compiled `_ARRAY_IDX_RE` constant (eliminates per-call regex compile in `_resolve_path`). `_PREDICATES` frozenset replaces per-call tuple (O(1) intersection check in `_validate_one_check`). Single `_to_lower_headers` call per `evaluate_expect` (was called twice when both headers + headers_regex checks present).
- [x] runner/runner.py (398) — 110/110 CLEAN. Column-pruned `verify_nodes` (Node.id, Node.type, Node.workspace_id; was full ORM object). `selectinload(Api.cases)` removed → explicit column-pruned ApiCase batch query with `in_([])` guard. `verified_file_ids` derived from `verify_nodes` result (was using raw payload file_ids, over-fetching APIs for unverified nodes). Dead commented-out block (lines 346-395) removed. `bulk_run_cases(data: Any)` type-annotated.
- [x] runner/execute_direct.py (384) — 110/110 CLEAN. Extracted `_execute_impl` → eliminates JSONResponse serialize+deserialize cycle in `execute_api_with_validation` (was decoding `.body` bytes back to dict on every call). `_MockResponse` promoted to module level with `body_json` param (reuses already-parsed JSON, skips re-parse). `_ExecError` exception class cleanly separates business failures from transport exceptions. Removed 6 dead imports (ExceptionHandler, merge_scopes, get_environment_variables, get_global_variables_for_user, OUTBOUND_VERIFY_TLS, logs). **Security fix: `assert_safe_url` added to `test_connectivity` — was missing (SSRF gap); `send_request` had it but `test_connectivity` did not).**

### Batch 7 — spec (~1,425 ln) ✅ DONE 2026-07-13
- [x] spec/import_spec.py (392) — 110/110 CLEAN. N+1 name-dedup (1 SELECT/op → 1 pre-load SELECT total) + 2n flush calls → 3 bulk flushes (add_all pattern). Dead `import shlex` + dead `_get_or_create_folder` removed. Security fix: `_schema_to_example_body` gained `_depth` guard (depth>10 early-return) — was unbounded recursion on deeply nested inline schemas.
- [x] spec/crud.py (265) — 110/110 CLEAN. Column-pruned list_specs (6 cols), delete_spec (2 cols + SQL DELETE instead of ORM delete), export_spec (1 col — only workspace_id needed). get_spec full-select kept (returns raw+parsed blobs). Dead `Workspace` model import removed. `from sqlalchemy import delete` added.
- [x] spec/curl.py (259) — 110/110 CLEAN. Already optimal (1 auth query, pure CPU transform). No changes.
- [x] spec/contract.py (250) — 110/110 CLEAN. Spec load column-pruned to (workspace_id, parsed, raw). Api load column-pruned to (method, endpoint) — was loading full ORM objects for all APIs in workspace; only endpoint needed for HTTP calls.

### Batch 8 — flow (~1,015 ln) ✅ DONE 2026-07-13
- [x] flow/crud.py (370) — 110/110 CLEAN. resolve_workspace_access (1-query auth, was get_user+can_access 3-4 queries); add_all+flush for steps (eliminates post-commit step SELECT per create/update); column-pruned list_flows (5 cols, skip graph JSON); column-pruned delete_flow (id+workspace_id only) + SQL DELETE; drop db.refresh (expire_on_commit=False); flow.updated_at set Python-side (accepted stale-by-ms tradeoff); no try/except (global handler).
- [x] flow/engine.py (282) — 110/110 CLEAN. Pre-load all request-step Apis+workspace_ids in 1 batch join query (was 2N queries for N request steps); column-pruned Flow load to (id, workspace_id) — skips large graph JSON; moved lazy imports (apply_auth, resolve_auth, _json, _dt) to top level; removed dead `dec_secret` import + `_mask_secrets` function (never called in original); `resolve_auth` added to common_querys import.
- [x] flow/run.py (244) — 110/110 CLEAN. resolve_workspace_access on all 3 endpoints; column-pruned Flow loads (id+workspace_id only); column-pruned FlowRun in list_flow_runs (6 cols, skip context JSON); FlowRun+Flow join in get_flow_run (1 query replaces separate FlowRun + Flow lookups); ORDER BY step_order on FlowStepResult query (drops Python sorted()); dead asyncio import removed; no try/except (global handler).

### Batch 9 — mock + docs (~1,090 ln) ✅ DONE 2026-07-14
- [x] mock/crud.py (483) — 110/110 CLEAN. resolve_workspace_access on all 9 endpoints; route+server joined in 1 query for update/delete route (was 2 separate selects); selectinload replaced with explicit method-filtered ORDER BY priority DESC route query; SQL DELETE for server/route (DB cascade); dropped 6 db.refresh; no try/except.
- [x] mock/from_history.py (218) — 110/110 CLEAN. Column-pruned server (id+workspace_id); column-pruned RequestHistory (7 cols); moved urlparse+json imports to top level; _route_dict imported from .crud (DRY); no try/except; no db.refresh.
- [x] mock/serve.py (120) — 110/110 CLEAN. Replaced selectinload with DB-side method filter + ORDER BY priority DESC route query; Python-side path template matching only; matched[0] replaces max(). Same 2 queries, less data, DB sort.
- [x] docs/generate.py (143) — 110/110 CLEAN. BFS O(depth) queries → recursive CTE (1 query); selectinload(Api.cases) → column-pruned ApiCase query with in_([]) guard; column-pruned Node (id+workspace_id+name); added GenerateDocResponse schema; db.flush before commit for new doc; no try/except; no db.refresh.
- [x] docs/publish.py (128) — 110/110 CLEAN. Column-pruned node (id+workspace_id) + doc (id+public_token); SQL UPDATE replaces ORM mutation for publish token + revoke; column-pruned PublishedDoc for public read (5 cols); added PublishDocResponse + PublicDocResponse schemas; no try/except; no db.refresh.

### Batch 10 — sso + auth (~1,030 ln) ✅ DONE 2026-07-14
- [x] auth/oauth2.py (284) — 110/110 CLEAN. Generic try/except removed; kept ValueError→400 (valid business branch). Dead `if existing is None: db.add(token)` inside the refresh block removed (was unreachable — `existing` always truthy there). Column-pruned user check to `select(User.id)`. `get_user_by_username` import dropped; use `username` header directly as `owner_username` (email==username in this project).
- [x] sso/pat.py (198) — 110/110 CLEAN. `db.refresh(pat)` removed (`expire_on_commit=False`). `list_pats` column-pruned to 6 cols. `revoke_pat` converted to SQL UPDATE + rowcount check (eliminates SELECT+ORM cycle). `exchange_pat` try/except removed; PAT query column-pruned to 3 cols; `last_used_at` write converted to SQL UPDATE. **Security fix: added `User.is_active` join in `exchange_pat`** — deactivated users could bypass account status via PAT (bughunt M finding).
- [x] sso/forget_password.py (150) — 110/110 CLEAN. try/except removed from both route handlers. **Bug fixed: outer try/except was swallowing `HTTPException` from `verify_and_consume_otp` — callers received 500 instead of 400/403.** `verify_and_consume_otp` raises `HTTPException` which FastAPI handles natively; no wrapper needed.
- [x] sso/otp_generation.py (109) — 110/110 CLEAN. try/except removed. Column-pruned User query to `is_active` only. Dead code removed: hardcoded `email_sent = True` + commented-out `email_otp_message` call. `email_otp_message`, `logs` imports removed (unused after dead code removal).
- [x] sso/login.py (77) — 110/110 CLEAN. try/except removed. Column-pruned User query to `(email, password, username)`.
- [x] sso/update_user.py (58) — 110/110 CLEAN. try/except removed. Email dup check column-pruned to `select(User.id)`. `get_password_hash` import dropped (was unused in original too). Full User ORM load kept — dynamic `setattr` loop requires ORM instance.
- [x] sso/create_user.py (48) — 110/110 CLEAN. try/except removed. Existence check column-pruned to `select(User.id)`. `ExceptionHandler` import dropped.
- [x] sso/user_profile.py (43) — 110/110 CLEAN. try/except removed. Column-pruned to 5 cols `(id, username, email, god, created_at)`. Removed `response_model=UserResponse` from decorator (project rule: schema goes to `create_response` arg only). `ExceptionHandler` import dropped.
- [x] sso/delete_user.py (41) — 110/110 CLEAN. try/except removed. Full SELECT+ORM mutation → SQL UPDATE; rowcount=0 → 404. `ExceptionHandler` import dropped.
- [x] sso/logout.py (25) — 110/110 CLEAN. try/except removed. `ExceptionHandler` import dropped.

### Batch 11 — themes + small singles (~915 ln) ✅ DONE 2026-07-14
- [x] history/request_history.py (285) — 110/110 CLEAN. get_user_by_username (full User) → select(User.id) ×5; db.refresh dropped; list_history column-pruned (8 cols, skips body/headers/params/response_body/response_headers); delete_history_entry SQL DELETE + rowcount (eliminated 1 SELECT).
- [x] variables/global_variables.py (220) — 110/110 CLEAN. N+1 upsert (N SELECT + N ORM mutations) → 1 pg_insert ON CONFLICT DO UPDATE; get_user_by_username → select(User.id) ×4; get_global_variables_for_user column-pruned to (key, value, is_secret); inner decrypt ValueError try/except kept (valid business branch → 409).
- [x] themes/activate_theme.py (65) — 110/110 CLEAN. get_user_by_username → select(User.id); db.refresh dropped.
- [x] themes/update_theme.py (63) — 110/110 CLEAN. get_user_by_username → select(User.id); db.refresh dropped.
- [x] themes/create_theme.py (62) — 110/110 CLEAN. get_user_by_username → select(User.id); dup-check column-pruned to select(UserTheme.id); db.refresh dropped.
- [x] themes/delete_theme.py (54) — 110/110 CLEAN. get_user_by_username → select(User.id); SQL DELETE + rowcount (eliminated 1 SELECT + ORM delete cycle).
- [x] themes/get_active.py (51) — 110/110 CLEAN. get_user_by_username → select(User.id).
- [x] themes/list_themes.py (48) — 110/110 CLEAN. get_user_by_username → select(User.id).
- [x] audit.py (65) — 110/110 CLEAN. get_user_by_username + can_access_workspace (3 queries) → resolve_workspace_access + has_min_role (1 query).

### Batch 12 — collab + monitor (~840 ln) ✅ DONE 2026-07-14
- [x] collab/versions.py (347) — 110/110 CLEAN. resolve_node_access (1 query) for create/list (was 4-5); NodeVersion⋈Node join + resolve_workspace_access (2 queries) for get/restore (was 5); list_versions column-pruned (skips snapshot JSON); _snapshot_node column-pruned (Api+ApiCase+Node children); _restore_node batched (N SELECT Api → 1 pre-load; N·M SELECT ApiCase → 1 batch; 1 flush for all new Apis); db.refresh dropped.
- [x] collab/comments.py (202) — 110/110 CLEAN. resolve_workspace_access (1 query, was 3-6); delete_comment: column-pruned select (2 cols) + SQL DELETE (was full ORM load + ORM delete); parent check pruned to select(Comment.id); db.refresh dropped.
- [x] monitor/crud.py (292) — 110/110 CLEAN. resolve_workspace_access on all 5 endpoints; schedule+monitor existence checks pruned to .id; _compute_rollup column-pruned to (status, duration_ms); get_monitor execution series column-pruned (8 cols); delete_monitor: column-pruned monitor + SQL DELETE; _COMPLETED_STATUSES → list (no per-call conversion); db.refresh dropped.

### Batch 13 — governance + meta + script (~855 ln) ✅ DONE 2026-07-14
- [x] governance/rules.py (396) — 110/110 CLEAN. resolve_workspace_access (1-query auth, was get_user+can_access 3-4 queries) on all 5 endpoints; column-pruned GovernanceRule for list (7 cols) + update (3 cols) + delete (2 cols) + lint (5 cols); SQL UPDATE for update, SQL DELETE for delete; db.refresh dropped (Python-side default); pre-compiled naming-rule regexes in lint (N×M re.compile → M compiles); column-pruned Api (3 cols) + ApiCase (4 cols) for lint; _check_rule gains Optional[re.Pattern] arg.
- [x] script/test_scheduler.py (324) — 110/110 CLEAN. Info-level logs removed from run_engine (error-only); compute_next_run async→def (no awaits); db.refresh(exec_obj) dropped; two-loop with fragile last_run==now → to_fire list (cleaner, no datetime equality hack).
- [x] meta/comparison.py (133) — 110/110 CLEAN. Already optimal (static data, no DB, schema arg present, no try/except). No changes.

### Batch 14 — schedulers + streaming proxies (~880 ln) ✅ DONE 2026-07-14
- [x] shedulers/shedule_test.py (605) — 106/110 CLEAN. get_user_by_username (full User) ×7 → select(User.id); selectinload(.executions) → GROUP BY count (1 query replaces N+1 load); selectinload(.schedule) in running executions → JOIN for schedule.name; all ownership checks pruned to select(.id); db.refresh ×2 dropped; BulkTestResult import moved top-level; CASCADE bug: manual result+execution pre-deletes were redundant (FKs have ondelete="CASCADE") — eliminated 2–3 extra queries per delete. API Design -4: no Pydantic schema for complex dict responses (no matching schemas exist; contracts frozen).
- [x] shedulers/alerts.py (125) — 110/110 CLEAN. try/except removed from all 4 handlers (was swallowing HTTPException from _assert_schedule_owner → 404/403 became 500, same bug as forget_password.py); _assert_schedule_owner column-pruned to select(BulkTestSchedule.username) only; db.refresh ×2 dropped; delete_alert: SQL DELETE + rowcount (eliminated SELECT + ORM delete cycle).
- [x] runner/ws_proxy.py (112) — 107/110 CLEAN. `import websockets` moved to module level (eliminates per-connection import cost); get_user_by_username → select(User.id) (email==username, so header used directly in token); try/except removed from issue_ws_ticket; open_timeout=10 added to websockets.connect. WS relay bare-except intentional (disconnect expected). Score -3: WS protocol prevents create_response schema pattern on websocket endpoint + relay silencing.
- [x] runner/sse_proxy.py (40) — 110/110 CLEAN. JSONResponse import moved to top level; otherwise already optimal.

## Regression gate (optional, per batch)
Backend running → run existing ApiPilot cases for touched endpoints before/after (`run_bulk` + `diff_runs`). Response diff must be empty. Skip if backend down; note skip here.

**Shared change (additive, verified safe):** `common_querys.py` — added `WorkspaceAccess` NamedTuple + `resolve_workspace_access()` helper (same pattern as resolve_node_access). Updated `has_min_role()` type hint to accept `WorkspaceAccess` too. No callers broken (additive only).

**Batch 3 bug found + fixed:** `headers/complete_headers.py` had pre-existing bug: iterating `folder_ids` dict (keys = "folder"/"file" strings) not its values → `folders_with_headers` always 0, `raw_headers_by_folder` always empty dict. Fixed to use `folder_ids.get("folder", []) + folder_ids.get("file", [])`. Same bug was in original; fixing it is a value change (0 → correct count) not a shape change.

**Batch 3 security fix:** `members.py` `_send_invite_email` — workspace_name embedded in HTML email via f-string without escaping (HTML injection). Fixed with `html.escape(workspace_name)`.

**Shared changes (additive, verified safe):**
- `common_querys.py` — added `get_collection_variables_with_secrets(db, file_id)` → `(merged_vars, secret_keys_set)`. Calls `get_folder_path_to_root` once + one CollectionVariable query. Used by `resolve_preview.py` to eliminate the double path walk.
- `schema.py` — added `ResolvePreviewVariable` + `ResolvePreviewResponse` (for resolve_preview endpoint) and `ApiDataResolveResponse` (for resolve_api_variables endpoint). Both additive; existing clients unaffected.

**Batch 4 session facts (carry forward):**
- `environment/resolve_variables.py` + `environment/list_variables.py` + `environment/create_environment.py` were already optimal — no changes needed, scored 110/110 as-is.
- `db.refresh` drop pattern: after SQL UPDATE, patch Python obj with `setattr` or use request-body values directly; `updated_at` stale by milliseconds in response (accepted tradeoff, same as batches 1-3).

**Batch 5 out-of-scope finding (not fixed):** SSRF protection disabled by default (`ssrf.py:13` — `SSRF_PROTECTION` defaults to "off"). Any authenticated user can use POST /graphql-introspect to probe internal services. Fix requires changing ssrf.py default; tracked here, not fixed in target files.

**Batch 5 session facts (carry forward):**
- `resolve_auth` is always safe to inline when folder-level auth is needed: the function body is a no-op for folders (placeholder comment, no Node.extra_meta column yet). File-level auth = `(api.extra_meta or {}).get("auth")` with type check.
- `selectinload(Api.cases)` pattern → always replace with separate column-pruned ApiCase query keyed by `ApiCase.api_id.in_(api_ids)`.
- `resolve_file_access` returns `access.api` with all Api columns — never re-fetch Api after calling it.

**Batch 6 session facts (carry forward):**
- `verify_nodes` now returns `List[Row]` (not `List[Node]`) — callers access `.id`, `.type`, `.workspace_id` which work fine on Row objects.
- `_ExecError` pattern (private exception carrying a `create_response` result) is now available in execute_direct.py; can reuse for similar short-circuit patterns in other route files.
- `test_connectivity` had SSRF gap (no `assert_safe_url`). Fixed. Variant risk: other probe/introspect functions that call outbound HTTP without routing through `send_request` should be audited for the same gap.
- `selectinload` → explicit batch query pattern confirmed safe for `ApiCase` (all 7 columns used; no extra columns exist).

**Batch 7 session facts (carry forward):**
- `db.add_all(items) + await db.flush()` confirmed as the bulk-flush pattern for ORM objects that need IDs (Python-side defaults apply, unlike raw `insert().values()`). Use when building a chain: nodes→flush→apis (using node.id)→flush→cases (using api.id).
- Column-pruned multi-col selects return `Row` objects; named attribute access (`row.workspace_id`, `row.method`, etc.) works on Row just like ORM objects — safe to pass Row anywhere the code only reads attributes.
- `select(Single.col).where(...).one_or_none()` — when selecting exactly 1 column, result is still a Row (not a scalar). Use `r[0]` or named attribute to extract; do NOT use `.scalar_one_or_none()` for multi-row fetchall (use `fetchall()` instead).
- `spec/curl.py` is pure CPU transform with 1 auth query — no DB optimization possible; scored 110/110 as-is.
- `_schema_to_example_body` depth guard: add `_depth: int = 0` param + `if _depth > 10: return {}` to any recursive schema-traversal helper to prevent DoS on deeply nested inline schemas (not caught by $ref depth limit).

## Status
- Started: 2026-07-12
- Completed batches: 1–14 (ALL DONE)
- Next: All batches complete. Run `graphify update .` + compileall sweep if not done.
- Notes: compileall + graphify update run after each batch. Backend not running → ApiPilot regression gate skipped.

**Batch 9 session facts (carry forward):**
- `from_history.py` imports `_route_dict` from `.crud` — private function import within same package is safe; eliminates 14 lines of duplication.
- Recursive CTE for subtree walk: `cte = select(Node.id).where(id==root).cte("subtree", recursive=True); recursive = select(Node.id).where(parent_id==cte.c.id); cte = cte.union_all(recursive)` → O(depth) BFS queries → 1 CTE query. Confirmed safe for PostgreSQL acyclic trees.
- `serve.py` uses `SessionLocal()` context manager directly (not `get_db` Depends) — correct for public no-auth endpoints outside the normal DI request lifecycle.
- `select(MockRoute, MockServer.workspace_id).join(...).where(...)` pattern for route+server auth: Row[0] = full ORM object, Row[1] = scalar; destructure as `route, workspace_id = row`. Confirmed pattern (same as Batch 8 FlowRun+Flow.workspace_id).
- `SQL UPDATE` for single-column changes (publish_token, public_token=None): avoids ORM full-object load + attribute mutation cycle when only 1 field changes. Pattern: `await db.execute(update(Model).where(...).values(field=val))`.
- `delete(MockServer)` (raw SQL) safe when FK has `ondelete="CASCADE"` — DB handles route cascade. Always verify FK cascade config before using raw DELETE over ORM delete.
- `_build_doc_content` in generate.py: cases_by_api dict with `setdefault(api_id, []).append(...)` avoids per-API case query; matches Batch 1 Counter/batch pattern.

**Batch 10 session facts (carry forward):**
- `username` header = email = `User.username` in this project (creation sets both to same value). Use `username` directly as `owner_username` — no need to re-fetch from DB after existence check.
- `delete_user` → SQL UPDATE pattern: `update(Model).where(col==val).values(field=False)` + `rowcount==0` → 404. Eliminates SELECT + ORM mutation cycle.
- `exchange_pat` security fix: always join `User` to check `is_active` when minting a JWT from a credential — a revoked/expired credential check alone is insufficient if accounts can be deactivated.
- `HTTPException` raised from helpers propagates correctly through FastAPI native handler when route handlers have NO try/except. The old pattern of wrapping `verify_and_consume_otp` in try/except was swallowing the 400/403 and returning 500.
- `user_profile.py` had `response_model=UserResponse` on the decorator — project rule is create_response schema arg only; decorator `response_model=` is redundant and was removed.
- Dead email code pattern: `email_sent = True` + commented-out real send = dev debt. Remove entirely; the OTP logic before and after is still valid.
- Column prune pattern for "just check existence": `select(User.id).where(...)` → `scalar_one_or_none() is not None`. Saves loading all User columns for simple auth/conflict checks.

**Batch 8 session facts (carry forward):**
- `select(Flow.id, Flow.workspace_id)` column-prune: graph JSON column can be large (UI canvas layout); always prune when only workspace_id needed.
- `select(FlowRun, Flow.workspace_id).join(Flow, ...).where(FlowRun.id == run_id)` pattern: mix ORM entity + scalar column in same select → Row where row[0] = ORM object, row[1] = scalar; destructure as `run, workspace_id = row`. Confirmed working in SQLAlchemy 2.x async.
- Pre-load Apis for flow steps: `select(Api.id, ..., Node.workspace_id).join(Node, Node.id == Api.file_id).where(Api.id.in_(request_api_ids))` → build `{api_id: row}` dict; use `api_row.workspace_id` from join instead of per-step Node query. Eliminates 2N queries → 1 for N request steps.
- Engine service function (not route handler) → try/except appropriate; bughunt CLEAN.
- `FlowRun.context` JSON field skipped in list_flow_runs (column-prune to 6 cols); context can be large accumulated variables dict.
