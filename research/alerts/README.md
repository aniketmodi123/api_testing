# Alerts

Status: Existing
Coverage: 85%

## Implemented
- `ScheduleAlert` model — email/webhook on success/failure/partial
- Alert firing on schedule execution completion
- Alert config per schedule (multiple alerts per schedule)

## Missing
- Monitor-level alert surfacing in UI (alerts exist but UI doesn't surface them in Monitor context)
- Alert delivery status tracking

## Current Task
None

## Next Task
Surface alerts in MonitorDetail FE (link from 13-monitoring)

## Dependencies
- 13-monitoring (alerts surface there)
- schedules (alert fires on schedule execution)

## Priority
P2
