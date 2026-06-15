# Phase 8 — Mock Servers — serve from captured responses (differentiator X10)

**Status:** not-started (stub)
**Phase:** 8
**Depends on:** Phase 0 (public-route prefix handling, SSRF n/a)
**Estimated scope:** full-stack · L

## What the user sees
Spin up a mock server from a collection. Routes match by method/path/matcher and return canned or
templated responses. Differentiator X10 — **promote real captured responses** (from
`request_history`/`bulk_test_results`) straight into mock routes; no manual example setup.

## Deliverables
- [ ] `mock_servers`, `mock_routes` tables
- [ ] Management endpoints (CRUD routes)
- [ ] Public serve route `/m/{public_token}/{path:path}` (no auth) — matcher + template + faker + delay
- [ ] "Create mock from history/result" action
- [ ] FE MockServerList + MockRouteEditor
- [ ] Tests: match precedence, no-auth serve, unguessable token, rate-limit

## Tasks → Subtasks (this is a STUB — do T0 first)
- [ ] T0 Scaffold spec.md + research.md + test_matrix.md from this README + root docs
- [ ] T1 `mock_servers` + `mock_routes` models + migration
- [ ] T2 Management endpoints (server + route CRUD)
- [ ] T3 Public serve `/m/{public_token}/{path:path}` (no auth) — matcher + template + faker + delay; prefix-match public route (phase_0 note)
- [ ] T4 "Create mock from history/result" action
- [ ] T5 FE MockServerList + MockRouteEditor
- [ ] T6 Tests: match precedence, no-auth serve, unguessable token, rate-limit

## Reuse
`request_history` + `bulk_test_results` snapshots; `resolve_variables` for templated bodies; public_routes prefix logic (noted in phase_0).

## Definition of Done
Public mock URL serves matched response; route created from a captured response in one click; token unguessable + rate-limited.
