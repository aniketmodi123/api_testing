# 10 — Workflows / Flows (Request Chaining + Orchestration)

Status: Partial
Coverage: 75%

## Implemented (backend)
- `Flow`, `FlowStep`, `FlowRun`, `FlowStepResult` models
- Flow CRUD endpoints
- Exec engine: ordered steps (request/condition/delay/set_var), jsonpath extract→run context, branch
- `POST /flow/{id}/run` async → run_id
- Run history endpoints (`GET /flow/{id}/runs`, `GET /flow/run/{run_id}`)
- Secrets masked in step results; run audited

## Specified but not yet built
- FE FlowCanvas component (canvas library decided: React Flow / `@xyflow/react`)
- FE FlowPalette (block drag-and-drop palette)
- FE BlockNode custom components (one per block type: 11 types)
- FE FlowBlockConfigPanel (right-side config for each block type)
- FE FlowVariablesPanel (flow-level variable definition)
- FE FlowTriggerConfig (manual / scheduled / webhook trigger setup)
- FE FlowRunHistory (run list with pagination)
- FE FlowRunViewer (per-step execution trace + canvas overlay)
- Engine: `loop` + `collect` + `evaluate` + `log` step types
- Backend: trigger endpoints (GET/POST /flow/{id}/trigger)
- Backend: webhook fire endpoint (POST /flow/webhook/{token})

## Still Missing (not yet specified)
- `send_request()` shared callable extracted from execute_direct (prerequisite — T2)
- Live run SSE (polling works; SSE is upgrade path)
- Flow template gallery (post-MVP)
- Canvas grouping/collapse for large flows (nice-to-have)
- FQL expression language (APIPilot uses JSONPath instead — acceptable)

## Current Task
Extract `send_request()` callable from execute_direct (T2 from phase spec)

## Next Task
FlowCanvas FE (XL scope) — React Flow (`@xyflow/react`) — see spec.md for full component breakdown

## Dependencies
- 04-variables (local run vars — scope chain must exist)
- 02-api-execution-engine (shared send_request fn)
- 06-authentication (auth per step)
- schedules feature (for scheduled trigger integration)

## Priority
P1

## Differentiator
X7 — first-class visual flow engine, free and unlimited (Postman Flows is paid/limited).
APIPilot UI copy: "Workflows". Code identifiers: "flow".

## Research Coverage
- Postman Flows canvas + blocks: fully researched (research.md)
- Block types: 11 types documented with ports and config
- Triggers: manual / scheduled / webhook — all documented
- Run history + output viewer: documented
- FQL vs JSONPath: decision made (keep JSONPath)
- Canvas library: decided (React Flow)
- FE component props: all defined (spec.md)
- State shape (FlowDefinition JSON): defined
- API calls needed: full table in spec.md
- Test matrix: 57 test cases (H18 + FH18 + E16 + FE14 + X10 + R6 + P5)
- Post-Aug-2025 flags: 15 UNVERIFIED items in research.md (plan gating, FQL grammar, date blocks, exact port names)
