# Spec — Flows

STATUS: not-started
LAST_CHANGED: 2026-06-15

## Goal
Deliver a flow engine for chaining + orchestration: ordered steps, jsonpath extraction into run context, conditional branching, delays.

## Deliverables
1. Four tables (flow/flow_steps/flow_runs/flow_step_results).
2. CRUD + run + run-history endpoints.
3. Async exec engine with run context (local vars), reusing the runner's send path.
4. Canvas + step editor + live run viewer.

## Backend Changes
### New Models
| Model | Fields | Notes |
|---|---|---|
| Flow | id, workspace_id(FK), name, description, graph(JSON), enabled, created_at, updated_at | graph = node/edge layout |
| FlowStep | id, flow_id(FK), step_order, type[request/condition/delay/set_var], api_id(FK null), config(JSON), extract(JSON jsonpath→var), condition(JSON) | |
| FlowRun | id, flow_id(FK), status, context(JSON run vars), started_at, finished_at, error_message | |
| FlowStepResult | id, flow_run_id(FK), step_id, success, request(JSON), response(JSON), duration_ms, created_at | secrets masked |

### New Endpoints
| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST/GET/PUT/DELETE | /flow[/{id}] | editor/viewer | CRUD |
| POST | /flow/{id}/run | editor | execute (async) → run_id |
| GET | /flow/{id}/runs | viewer | run history |
| GET | /flow/run/{run_id} | viewer | run + step results |

### Modified Endpoints / Logic
| File | Change |
|---|---|
| (new) routers/flow/*.py | CRUD + run + history |
| (new) routers/flow/engine.py | step executor; reuse runner send + validator |
| routers/runner/execute_direct.py | extract shared send fn for reuse by engine |
| main.py | register flow routers; import models |

## Frontend Changes
### New Components
| Component | Location | Purpose |
| FlowCanvas | components/Flows | node-graph builder |
| FlowStepEditor | components/Flows | per-step config + extract + condition |
| FlowRunViewer | components/Flows | live step status + results |
### New Routes / Pages
| Route | Component |
| /flows | FlowsPage (list → canvas) |

## Decision Table
| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Engine execution | in-process async, own DB session | reuse FastAPI async; queue later if scale (O2) |
| 2 | Reuse send path | extract shared fn from execute_direct | DRY, auth/var/secret consistent |
| 3 | Extraction | jsonpath into FlowRun.context (local vars) | feeds phase_4 local scope |
| 4 | Run async | return run_id, poll/WS for progress | don't block request lifecycle |
| 5 | Secrets in results | mask before persist | phase_1 rule |
| 6 | Branch | condition step evals context | conditional logic parity |

## Edge Cases
| # | Trap | How it breaks | Fix |
|---|---|---|---|
| 1 | Infinite loop in graph | engine hangs | max-steps guard + cycle detect |
| 2 | Step fails mid-flow | partial run | record failure, stop or continue per config |
| 3 | jsonpath no match | null var downstream | mark unresolved, surface in result |
| 4 | Long flow blocks worker | event-loop starvation | async + step timeouts |
| 5 | Run context holds secret | leak in results | mask |
| 6 | Concurrent runs same flow | shared state? | each FlowRun owns its context |

## Open Questions
| # | Question | Recommendation |
|---|---|---|
| 1 | Live progress transport | reuse ws_proxy pattern or poll | WS if available, else poll runs endpoint |
| 2 | Queue backend for scale | defer (O2); in-process MVP | revisit when >N concurrent flows |
