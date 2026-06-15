# Phase 5 — Flows — request chaining + orchestration (differentiator X7)

**Status:** not-started
**Phase:** 5
**Depends on:** Phase 4 (variable scopes / local vars)
**Estimated scope:** full-stack · XL

---

## What the user sees after this is done
A visual flow builder: chain requests, extract values from one response (jsonpath) into a run
variable, feed them into the next, branch on conditions, add delays. Runs as one orchestrated
sequence with per-step results. Differentiator X7 — first-class, unlimited, integrated (Postman
Flows is paid/limited and a separate surface).

## Deliverables
- [ ] `flows`, `flow_steps`, `flow_runs`, `flow_step_results` tables
- [ ] Flow CRUD endpoints
- [ ] Exec engine: ordered steps (request/condition/delay/set_var), jsonpath extract→run context, branch
- [ ] `POST /flow/{id}/run` async (own DB session), run history endpoints
- [ ] FE FlowCanvas + FlowStepEditor + FlowRunViewer (live step highlight)
- [ ] Secrets masked in step results; run audited

## Tasks → Subtasks (execute in order; each subtask = one PR ≤1 day)
> Detail in spec.md / reuse in research.md. Check off when its test_matrix rows pass.

### T1 — Schema   [files: models.py, alembic]   [done when: H1 green]
- [ ] T1.1 `Flow`, `FlowStep`, `FlowRun`, `FlowStepResult` models + migration

### T2 — Shared send fn   [files: runner/execute_direct.py]   [done when: R1 green]
- [ ] T2.1 Extract `send_request(...)` callable from execute_direct (handler stays thin) — engine reuses it with auth+var+secret resolution

### T3 — CRUD   [files: routers/flow/*.py, main.py]   [done when: H1, DAG-validate E1 green]
- [ ] T3.1 Flow create/list/detail/update/delete; validate DAG on save (no cycles)

### T4 — Exec engine   [files: routers/flow/engine.py]   [reuse: send_request, resolve_variables+context, validator]   [done when: H2,H3,H4,E2,E3,E5 green]
- [ ] T4.1 Step loop: resolve(context)→send→extract jsonpath→context→branch/delay
- [ ] T4.2 Own SessionLocal; max-steps guard + step timeouts; mask secrets in results

### T5 — Run + history endpoints   [files: routers/flow/run.py]   [done when: H5,H6,X1,X2 green]
- [ ] T5.1 `POST /flow/{id}/run` async → run_id (audit flow.run)
- [ ] T5.2 `GET /flow/{id}/runs` + `GET /flow/run/{run_id}`

### T6 — UI   [files: components/Flows/*, pages, store/apiSlice.js]   [done when: build+run+view works]
- [ ] T6.1 FlowCanvas (node-graph) + FlowStepEditor (config/extract/condition)
- [ ] T6.2 FlowRunViewer (live step status + per-step results)

## AI agent files
| File | Purpose |
|---|---|
| spec.md | Backend + frontend changes |
| research.md | Existing code to reuse |
| test_matrix.md | Acceptance tests |
