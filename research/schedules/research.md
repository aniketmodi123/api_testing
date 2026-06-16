# Research — Schedules

LAST_UPDATED: 2026-06-16

## Existing Code
| File | Purpose |
|---|---|
| `backend/src/models.py` | `BulkTestSchedule`: `id, workspace_id, node_id, cron_expr, next_run, enabled` |
| `backend/src/routers/script/test_scheduler.py` | Schedule CRUD endpoints |
| `backend/src/routers/runner/runner.py` | Scheduler worker: polls for due schedules, fires execution |

## Scheduler Loop Pattern
```python
# runner.py:
# SELECT schedules WHERE enabled AND next_run <= now
# For each due schedule:
#   create BulkTestExecution
#   run bulk_run_cases
#   update next_run = next_cron(cron_expr)
#   update Monitor rollup (if monitor linked)
```

## Known Gap
No `SELECT FOR UPDATE SKIP LOCKED` — at >1 scheduler worker, same schedule could run twice. Safe at single-worker MVP.
