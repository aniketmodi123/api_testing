# Spec — Collection Runner

STATUS: stable (existing feature)
LAST_CHANGED: 2026-06-16

## Current State
Runner works end-to-end. No new backend work needed here.

## Related Features That Extend the Runner
| Feature | What it adds | Where |
|---|---|---|
| Monitoring | Uptime/p95 rollup on top of BulkTestExecution | 13-monitoring |
| Workflows/Flows | Chaining + orchestration between steps | 10-workflows |
| Regression diff | Diff two BulkTestExecution result sets | 21-regression-diff |
