# Test Matrix — Workflows / Flows

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_5_flows/test_matrix.md + Postman Flows research gaps

---

## Happy Path — Backend Engine

| ID | Scenario | Expected |
|---|---|---|
| H1 | Create flow with steps | Persisted, DAG valid |
| H2 | 2-step chain (login → extract token → use token) | Step 2 sends token, both pass |
| H3 | Conditional branch — condition true | TRUE branch taken; FALSE branch blocks skipped |
| H3b | Conditional branch — condition false | FALSE branch taken; TRUE branch blocks skipped |
| H4 | Delay step | Run waits configured ms then continues; next step executes |
| H5 | Run history list | Past runs + status returned; paginated |
| H6 | Step results | Per-step request/response details returned in GET /flow/run/{id} |
| H7 | Set variable step | Context var written; subsequent step resolves it correctly |
| H8 | Loop step (For) over 3-item list | Sub-steps execute 3× with correct `item` and `index` values |
| H9 | Collect step after loop | Accumulates 3 items into list in context |
| H10 | Log step | Debug message appears in FlowStepResult without halting flow |
| H11 | Template step with 2 vars | Output string has both vars interpolated correctly |
| H12 | Evaluate step (JSONPath expression) | Result stored in context var; subsequent steps see value |
| H13 | Flow with all step types combined | Runs to completion; all steps have results |
| H14 | Webhook trigger fires flow | POST to webhook URL → run created → run completes |
| H15 | Scheduled trigger fires flow | Scheduler fires at cron time → run created (integration with scheduler feature) |
| H16 | Flow variables passed at run time | Pre-run variable values override defaults; visible in context |
| H17 | Send Request block uses collection auth | Auth headers sent without user specifying them per-step |
| H18 | Variable override on Send Request | Flow variable overrides collection variable for that step only |

---

## Happy Path — Frontend (FlowCanvas)

| ID | Scenario | Expected |
|---|---|---|
| FH1 | Open flow builder — existing flow loads | Canvas shows all nodes and edges at correct positions |
| FH2 | Drag block from palette onto canvas | New node appears at drop position; config panel opens |
| FH3 | Wire Send Request `body` output to Select `data` input | Edge drawn with correct colour; save succeeds |
| FH4 | Open config panel for Send Request block | Collection + request pickers populated from API |
| FH5 | Save flow | PUT /flow/{id} called with serialised graph; success toast shown |
| FH6 | Run flow from toolbar | POST /flow/{id}/run → FlowRunDrawer opens with run_id |
| FH7 | Run drawer polls for completion | Status updates every 2s; shows passed/failed when done |
| FH8 | Open FlowRunViewer | Per-step accordion shows inputs/outputs; Output tab shows final value |
| FH9 | FlowRunViewer canvas overlay | Passed steps have green border; failed step has red border |
| FH10 | Flow Variables panel — add variable | Variable appears in context; available to block config panels |
| FH11 | Trigger config — set scheduled | Cron saved; trigger badge in toolbar updates |
| FH12 | Trigger config — webhook | URL displayed; copy button works |
| FH13 | Delete a node | Node and all connected edges removed |
| FH14 | Delete an edge | Edge removed; source and target handles become unconnected |
| FH15 | Zoom and pan canvas | Canvas moves/scales; minimap updates |
| FH16 | MiniMap shows correct layout | Minimap positions match canvas nodes |
| FH17 | Auto-layout button | Nodes rearranged in execution order (left to right) |
| FH18 | Read-only mode (viewer role) | No drag, no add, no delete; config panel is read-only |

---

## Edge Cases — Backend Engine

| ID | Scenario | Expected |
|---|---|---|
| E1 | Cyclic graph on save | Rejected with 400 — DAG validation error + cycle path in message |
| E2 | Step fails mid-flow | Run marked failed at that step; subsequent steps marked skipped; results captured |
| E3 | JSONPath no match | Var unresolved, flagged in FlowStepResult; flow continues (soft failure) |
| E4 | Secret in context | Masked in FlowStepResult; raw only in-memory during run |
| E5 | Two concurrent runs of same flow | Independent FlowRun contexts; no state sharing |
| E6 | For loop with empty list | Loop body skipped entirely; `done` port fires immediately |
| E7 | Nested loops (For inside For body) | Both loops execute correctly with independent index vars |
| E8 | Template with missing variable | `{{var}}` rendered literally; flagged as warning in step result |
| E9 | Step timeout exceeded | Step result: timeout error; run marked failed; worker released |
| E10 | Evaluate step — malformed JSONPath | Step result: parse error; run marked failed at that step |
| E11 | Collect with no For — fires once | Collect emits whatever single value it received |
| E12 | Max-steps guard triggered | Run aborts safely after N steps; marked failed with "max steps exceeded" |
| E13 | Webhook payload contains internal IP | SSRF block triggered; run marked failed; no network call made |
| E14 | Flow with 0 steps | Run immediately passes with empty step results |
| E15 | Delay step — very long delay (e.g. 30s) | Run waits; worker not blocked (async sleep); run completes |
| E16 | Variable set in step, used in same step | Must be a subsequent step; same-step reference is undefined |

---

## Edge Cases — Frontend (FlowCanvas)

| ID | Scenario | Expected |
|---|---|---|
| FE1 | Type mismatch wire attempt | Connection blocked; tooltip shows "Type mismatch: object → string" |
| FE2 | Self-loop edge | Blocked; no edge created |
| FE3 | Duplicate node IDs (corrupt state) | Canvas shows error boundary; user prompted to reload |
| FE4 | Very large flow (50+ nodes) | Minimap available; canvas does not freeze; auto-layout works |
| FE5 | Edge to non-existent node (stale graph JSON) | Canvas shows warning node; save blocked until resolved |
| FE6 | Collection deleted — Send Request block | Block shows "Collection not found" error state inline |
| FE7 | Simultaneous edits (optimistic lock) | Second save returns 409; user sees conflict warning; reload prompt |
| FE8 | Unsaved changes — navigate away | Browser confirmation dialog ("You have unsaved changes") |
| FE9 | Template block — add {{newvar}} in textarea | New input handle appears automatically on node |
| FE10 | Template block — remove {{var}} from textarea | Input handle removed; connected edge removed with warning |
| FE11 | Run while flow has unsaved changes | Prompt: "Save before running?" |
| FE12 | FlowRunViewer — run still in progress | Canvas shows pulsing blue on running block; polling active |
| FE13 | FlowRunViewer — failed step | Red border on failed node; error message in accordion |
| FE14 | FlowRunViewer — skipped steps | Grey border on skipped nodes; accordion shows "skipped" |

---

## Error Cases — Backend

| ID | Scenario | Expected |
|---|---|---|
| X1 | Viewer role tries to run flow | 403 |
| X2 | Run non-existent flow | 404 |
| X3 | Step targets internal IP | SSRF blocked; 400 or step marked failed |
| X4 | Max-steps exceeded | Run aborts safely |
| X5 | Webhook token invalid | 401 |
| X6 | Webhook token valid but flow disabled | 400 "flow is disabled" |
| X7 | Scheduled trigger for disabled flow | Run skipped; no FlowRun created |
| X8 | Save flow with duplicate node IDs | 400 validation error |
| X9 | Save flow referencing non-existent api_id | 400 validation error |
| X10 | Get run from different workspace | 403 or 404 (workspace isolation) |

---

## Regression — Shared Dependencies

| ID | Existing feature | Must still work |
|---|---|---|
| R1 | execute_direct single send | Unchanged after refactor to shared `send_request()` fn |
| R2 | run_case / bulk_run | Unchanged |
| R3 | Variable + auth resolution | Reused identically in flow steps |
| R4 | Secrets vault masking | Masks correctly in FlowStepResult.response |
| R5 | Scheduler feature | Unaffected by flow trigger integration (no regression on existing scheduled test cases) |
| R6 | Collection CRUD | Flows referencing collections still resolve after collection rename |

---

## Performance Baseline

| ID | Scenario | Acceptance Threshold |
|---|---|---|
| P1 | 10-step flow run end-to-end | < 10s wall time (excluding actual request latency) |
| P2 | Canvas load — 50-node flow | < 2s initial render |
| P3 | Save 50-node flow graph | < 500ms PUT response |
| P4 | Run history list — 100 runs | < 300ms GET response |
| P5 | FlowRunViewer — 50 step results | < 1s load; accordion renders all without scroll jank |
