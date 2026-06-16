# Spec — Monitoring

STATUS: in-progress (backend done; FE missing)
LAST_CHANGED: 2026-06-16
SOURCE: phases/phase_10_monitoring/spec.md

## Goal
First-class Monitors: uptime %, p95 latency, pass-rate trend — free and unlimited. Differentiator X2.

## Backend (shipped)

### Endpoints
| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST | `/workspace/{workspace_id}/monitor` | editor | Create monitor |
| GET | `/workspace/{workspace_id}/monitors` | viewer | List with uptime + p95 |
| GET | `/monitor/{monitor_id}` | viewer | Detail + latency series (last 50 execs) |
| PUT | `/monitor/{monitor_id}` | editor | Update name / toggle enabled |
| DELETE | `/monitor/{monitor_id}` | admin | Delete monitor + schedule |

## Frontend (missing)
| Component | Purpose |
|---|---|
| MonitorList | Uptime % + p95 badges per monitor |
| MonitorDetail | Latency sparkline + pass/fail trend |

## Decision Table
| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | 1-to-1 monitor↔schedule | Monitor is a named view over one schedule | Schedule owns execution cadence |
| 2 | Rollup timing | After each run_execution_task | Avoids separate cron process |
| 3 | p95 computation | In Python (not PERCENTILE_CONT) | Avoids Postgres version dependency |
| 4 | 30-day window | Rolling 30 days | Matches Postman's window; configurable later |
| 5 | Schedule DELETE cascades monitor | Schedule owns run data | Monitor is metadata |
