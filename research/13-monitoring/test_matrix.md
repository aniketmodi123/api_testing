# Test Matrix — Monitoring

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_10_monitoring/README.md

## Happy Path
| ID | Scenario | Expected |
|---|---|---|
| H1 | Create monitor (wraps schedule) | Monitor persisted, schedule linked |
| H2 | Run execution completes | Rollup updates uptime_pct + p95 |
| H3 | List monitors | uptime_pct + p95_latency_ms returned |
| H4 | Detail view | Latency series last 50 execs |

## Edge Cases
| ID | Scenario | Expected |
|---|---|---|
| E1 | No executions yet | uptime_pct=0, p95=null |
| E2 | All executions failed | uptime_pct=0 |
| E3 | Delete schedule | Monitor cascade-deleted |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | ScheduleAlert fires | Unchanged |
| R2 | BulkTestExecution runs | Unchanged; rollup just appends |
