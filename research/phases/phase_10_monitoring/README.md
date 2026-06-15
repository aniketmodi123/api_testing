# Phase 10 — Monitoring — scheduler-native monitors (differentiator X2)

**Status:** not-started (stub)
**Phase:** 10
**Depends on:** none (reuses existing scheduler + alerts)
**Estimated scope:** full-stack · M

## What the user sees
First-class Monitors: uptime %, p95 latency, pass-rate trend per collection — **free and
unlimited** (differentiator X2; Postman monitors are a paid, run-limited add-on). Built on the
scheduler + alerts that already exist.

## Deliverables
- [ ] `monitors` table (wraps a `bulk_test_schedule`, rollup fields)
- [ ] Rollup job: uptime/p95 from `bulk_test_executions`
- [ ] Monitor endpoints (list w/ uptime+p95, detail w/ latency series)
- [ ] FE MonitorList + MonitorDetail (reuse existing latency sparkline)
- [ ] Tests: rollup calc correctness

## Tasks → Subtasks (this is a STUB — do T0 first)
- [ ] T0 Scaffold spec.md + research.md + test_matrix.md from this README + root docs
- [ ] T1 `monitors` model + migration (wraps a bulk_test_schedule)
- [ ] T2 Rollup job: uptime/p95 from `bulk_test_executions`
- [ ] T3 Monitor endpoints (list uptime+p95, detail latency series)
- [ ] T4 FE MonitorList + MonitorDetail (reuse latency sparkline)
- [ ] T5 Tests: rollup calc correctness

## Reuse
`bulk_test_schedules`, `schedule_alerts` (already email/webhook), `bulk_test_executions`, existing sparkline (phase_5 monitoring work already done in old codebase).

## Definition of Done
Monitor dashboard shows accurate uptime/p95/pass-rate; alerts fire on failure; no run limit.
