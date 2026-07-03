# 09 — Collection Runner

Status: Existing
Coverage: 90%

## Implemented
- `bulk_run_cases.py` — async multi-case execution
- `BulkTestPanel` + `BulkResults` modal FE
- Run history: `BulkTestExecution` + `BulkTestResult` tables
- `bulk_test_schedules` — scheduled runs with cron
- `ScheduleAlert` — email/webhook on success/failure/partial
- Request/response snapshots stored per result
- Retry/backoff in runner

## Missing
- Request chaining across cases (see 10-workflows)
- Regression diff view (see 21-regression-diff — ships as part of contract-testing)

## Current Task
None — runner is solid; gaps are in dependent features

## Next Task
Surface as "Monitor" UI (see 13-monitoring)

## Dependencies
- 13-monitoring (monitor wraps schedule + adds uptime rollup)
- 10-workflows (chaining adds value extraction between cases)

## Priority
P0 (existing, stable)
