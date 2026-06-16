# Schedules

Status: Existing
Coverage: 90%

## Implemented
- `BulkTestSchedule` model + CRUD
- Cron-based scheduler worker (separate supervisord process)
- `next_run` calculation
- `SELECT FOR UPDATE SKIP LOCKED` — DEFERRED (scheduler dedup guard; T5.2 from phase_0)

## Missing
- `SELECT FOR UPDATE SKIP LOCKED` on due schedules (prevents double-run at >1 worker)

## Current Task
None

## Next Task
`SELECT FOR UPDATE SKIP LOCKED` (when multiple scheduler workers needed)

## Dependencies
- 22-security (deferred Alembic for scheduler guard)

## Priority
P2
