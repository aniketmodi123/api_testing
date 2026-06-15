# Research — Flows

LAST_UPDATED: 2026-06-15

## Existing Code to Reuse
| File | Function/Component | How to use |
|---|---|---|
| routers/runner/execute_direct.py | request assembly + httpx send | extract a shared `send_request(...)` the engine calls per step |
| routers/runner/run_case.py + validator.py | case run + assertions | engine can run a case-step + assert |
| routers/runner/bulk_run_cases.py | async multi-run orchestration | model for engine's per-step loop + result persistence |
| utils.py `resolve_variables` (phase_4) | var substitution w/ scope chain + run context | inject FlowRun.context as local scope |
| common_querys.py `resolve_auth` (phase_3) | inherited auth | each request-step authed |
| models BulkTestExecution/Result | run+result persistence shape | mirror for FlowRun/FlowStepResult |
| frontend @uiw/react-codemirror | editors | step config/extract editing |

## Patterns in this Codebase
```python
# bulk_run_cases async loop = template for engine step loop:
# for each case: build → send → validate → persist result
# Flow engine: for each step in order: resolve(context) → send → extract→context → branch
```
```python
# jsonpath extract into run context (new):
context[step.extract["var"]] = jsonpath(response_json, step.extract["path"])
```

## API Contracts
| Endpoint | Input | Output | Notes |
|---|---|---|---|
| POST /flow/{id}/run | {input_vars?} | {run_id,status} | async; audit flow.run |
| GET /flow/run/{run_id} | — | run + step results | secrets masked |

## Component Patterns
FlowCanvas: lightweight node-graph (could use a small lib or hand-rolled SVG to avoid heavy dep —
match repo's no-heavy-lib stance). FlowRunViewer mirrors TestResultsGrid/Card for per-step results.

## Gotchas
| # | Thing | Why it trips you up | How to handle |
|---|---|---|---|
| 1 | execute_direct logic is inline in handler | engine needs it without HTTP layer | refactor send into a callable, keep handler thin |
| 2 | jsonpath lib choice | new dep | use small `jsonpath-ng` or minimal hand-rolled for common paths |
| 3 | async run needs own DB session | reusing request session breaks | open SessionLocal in engine (like get_global_variables_for_user) |
| 4 | secrets in context | leak in persisted result | mask on persist, keep raw only in-memory during run |
| 5 | graph cycles | hang | validate DAG on save + max-steps guard |
