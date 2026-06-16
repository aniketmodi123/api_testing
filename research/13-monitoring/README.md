# 13 — Monitoring

Status: Partial
Coverage: 50%

## Implemented (backend)
- `Monitor` model (1-to-1 wraps `BulkTestSchedule`)
- Monitor CRUD endpoints
- Rollup: uptime_pct, p95_latency_ms computed from last 30 days of executions
- Rollup runs synchronously after each `run_execution_task` completes
- Latency series: last 50 executions for detail view
- Existing `ScheduleAlert` wires email/webhook on failure

## Missing
- FE MonitorList (uptime % + p95 badges)
- FE MonitorDetail (latency sparkline)

## Current Task
None (backend done)

## Next Task
FE MonitorList + MonitorDetail

## Dependencies
- 09-collection-runner (wraps BulkTestSchedule + BulkTestExecution — done)

## Priority
P2

## Differentiator
X2 — free and unlimited monitors (Postman: paid, 1000 call cap on free tier)
