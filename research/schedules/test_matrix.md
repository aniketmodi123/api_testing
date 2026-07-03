# Test Matrix — Schedules

LAST_UPDATED: 2026-06-16

## Happy Path
| ID | Scenario | Expected |
|---|---|---|
| H1 | Create schedule | next_run computed from cron |
| H2 | Due schedule fires | BulkTestExecution created |
| H3 | Disable schedule | Does not fire |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | Monitor rollup after run | Unchanged |
| R2 | ScheduleAlert fires | Unchanged |
