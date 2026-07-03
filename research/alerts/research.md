# Research — Alerts

LAST_UPDATED: 2026-06-16

## Existing Code
| File | Purpose |
|---|---|
| `backend/src/models.py` | `ScheduleAlert`: `id, schedule_id(FK), type(email/webhook), target, trigger(success/failure/partial)` |
| `backend/src/routers/runner/runner.py` | Alert firing after execution completion |

## Alert Trigger Logic
After `BulkTestExecution` completes:
1. Load all `ScheduleAlert` rows for schedule
2. Filter by trigger matching execution status
3. Send email or POST webhook
