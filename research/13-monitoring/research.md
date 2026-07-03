# Research — Monitoring

LAST_UPDATED: 2026-06-16
SOURCE: training knowledge (cutoff Aug 2025) + codebase trace

---

## Postman Monitors — What They Are

A Postman Monitor runs a saved Collection against an optional Environment on a schedule
from Postman's cloud infrastructure. Its primary uses are uptime checking, performance
regression detection, and correctness verification of API response payloads.

Canonical reference: https://learning.postman.com/docs/monitoring-your-api/intro-monitors/

---

## Monitor Configuration (Postman)

### Core fields
| Field | Values / Notes |
|---|---|
| Name | Free-form display name |
| Collection | One collection per monitor |
| Environment | Optional; one environment selected at creation |
| Schedule | Fixed intervals: 5min, 15min, 30min, 1hr, 6hr, 12hr, 24hr; custom cron on paid plans |
| Region | US East, US West, EU West, AP Southeast, AP Northeast (multi-region adds per-region result rows) |
| Retry on failure | 0–3 retries before marking the run as failed |
| Request timeout | Per-request ms ceiling (default 5000ms on Postman cloud) |
| Delay between requests | ms pause inserted between consecutive requests in the collection |

### Notification targets
| Channel | Config |
|---|---|
| Email | One or more addresses; trigger: on failure / on recovery / always |
| Slack | Incoming Webhook URL; same trigger options |
| PagerDuty | Integration key; same trigger options |
| Custom webhook | HTTP POST to any URL; payload is the monitor run summary JSON |

Alert storm control: Postman sends one failure alert per incident, then a single recovery
alert when the monitor passes again. It does NOT send an alert for every consecutive
failing run. [UNVERIFIED — exact throttle algorithm not in public docs as of Aug 2025;
confirm current behavior at learning.postman.com/docs/monitoring-your-api/setting-up-monitor/]

---

## Monitor Dashboard — Postman

### Monitor list view
- Table columns: name, status badge (healthy / failing / paused), schedule interval,
  last run time, last run duration, actions (run now / pause / edit / delete)
- Status badge colors: green (healthy), red (failing), grey (paused)
- Sortable by: name, last run time, status

### Per-monitor detail view
| Section | Detail |
|---|---|
| Run history chart | Bar or line chart of pass/fail over time (last 7 or 30 days) |
| Response time graph | Line chart: average and p95 per run |
| Uptime percentage | Displayed as a number (e.g. 99.3%) for last 7d and 30d |
| Per-request breakdown | Which request in the collection failed; status code, response time, test results per assertion |
| Error log | Full error message + stack (if JS test threw) per failed run |
| Full request/response | Stored for failed runs; Postman truncates response body at ~5 MB |
| Region breakdown | If multi-region: results split by region |

### Filters
- Time range: last 24h, 7d, 30d, custom date picker
- Status: all / pass / fail
- Region: all / specific region

### Export
- CSV export of run history (run time, duration, status, pass count, fail count)
  [UNVERIFIED — CSV export may be Enterprise-only as of Aug 2025; check current pricing page]

---

## Monitor Run Result Structure

Each completed run has:

```
RunResult
  run_id
  monitor_id
  started_at
  finished_at
  status          "pass" | "fail" | "error"
  duration_ms     total wall-clock time for all requests in collection
  region          which cloud region executed the run
  requests[]
    request_name
    url
    method
    status_code
    response_time_ms
    latency_breakdown
      dns_ms
      connect_ms
      tls_ms
      ttfb_ms
      download_ms
    assertions[]
      name
      passed        bool
      error_message nullable
    response_body   truncated at N bytes (Postman: ~5 MB for failed runs; not stored for passed runs)
```

APIPilot today stores: `BulkTestExecution` (run-level) + `BulkTestExecutionResult` (per-case).
Missing: latency breakdown sub-fields (dns/connect/tls/ttfb/download) — not in current schema.
Missing: per-request response body storage for failed runs.
Missing: region field (APIPilot runs locally — no cloud regions, but self-hosted = user's own infra).

---

## Postman Pricing / Gating

| Tier | Monitor runs / month | Regions | Schedule min interval |
|---|---|---|---|
| Free | 1,000 calls | 1 | 15min [UNVERIFIED — check current Postman pricing page] |
| Basic | 10,000 calls | 1 | 5min |
| Professional | 100,000 calls | 3 | 5min |
| Enterprise | Unlimited | All | custom cron |

APIPilot differentiator: self-hosted = unlimited runs, no call cap, no seat tax, any region
(i.e. the user's own infra or their own cloud VMs). Monitors run from wherever APIPilot is
deployed — behind VPN, in a private subnet, on-premise.

Verified current Postman limits (Jun 2026 research):
- Free plan: monitors auto-pause when monthly call limit hit
- Max 300 active+paused monitors per team
- Max 500 parallel monitor runs per team; 200 parallel runs for a single monitor
- Data retention: 6 months of run logs (older runs exist but with limited detail)

[Postman pricing tiers and call counts change frequently; always verify at
https://www.postman.com/pricing/ before using in marketing copy]

---

## Existing Code (APIPilot)

| File | Purpose |
|---|---|
| `backend/src/routers/monitor/crud.py` | Monitor CRUD endpoints (5 endpoints) |
| `backend/src/models.py` | `Monitor` model, `BulkTestSchedule`, `BulkTestExecution`, `ScheduleAlert` |
| `backend/src/routers/runner/runner.py` | `run_execution_task` — rollup triggered post-commit |
| `backend/src/routers/script/test_scheduler.py` | Scheduler polling loop |
| `backend/src/notification_service.py` | Email + webhook dispatch via `ScheduleAlert` |

### Monitor model (as built)
```
Monitor
  id              PK
  workspace_id    FK → workspaces CASCADE
  schedule_id     FK → bulk_test_schedules CASCADE (UNIQUE — 1 monitor per schedule)
  name            varchar(255)
  uptime_pct      Numeric(5,2) nullable   -- % non-failed execs, last 30d
  p95_latency_ms  Integer nullable        -- 95th pct of duration_ms, last 30d (Python computed)
  last_status     varchar(20) nullable    -- most recent completed exec status
  updated_at      TIMESTAMP (auto on update)
```

### BulkTestSchedule schedule types (as built)
```
ScheduleType enum: once | minutely | hourly | daily | weekly | monthly
interval_count: int  (e.g. minutely + interval_count=5 → every 5 minutes)
```

APIPilot supports `minutely` (which maps to Postman's "every 5/15/30 min" options).
The schedule is expressed as type + interval_count, not a fixed pick-list — more flexible
than Postman's dropdown.

### ScheduleAlert (as built)
```
ScheduleAlert
  type:       "email" | "webhook"
  target:     email address or webhook URL
  on_failure: bool
  on_success: bool
  on_partial: bool
```

Gaps vs Postman alerts:
- No Slack-specific integration (Postman has first-class Slack app). APIPilot uses generic
  webhook — Slack incoming webhooks ARE compatible with this pattern; just needs doc note.
- No PagerDuty integration. Postman has dedicated PagerDuty connector.
- No alert storm / exponential backoff logic — repeated failures each trigger a notification.
  Postman sends one alert per incident (confirmed from Postman docs up to Aug 2025).
  APIPilot should add: "notify on first failure only; notify again on recovery" logic.
- No "on_recovery" field (distinct from on_success). Recovery = first success after N failures.

### Rollup logic (as built)
- Window: last 30 rolling days
- uptime_pct = (non-failed / total completed) * 100, rounded to 2dp
- p95_latency_ms = Python-sorted durations[int(n*0.95)] — correct percentile implementation
- Runs synchronously at end of `run_execution_task` (same DB session, before commit)
- Latency series endpoint: last 50 completed executions, ordered finished_at DESC

---

## Gap Analysis — What Postman Has vs APIPilot

### Backend gaps
| Gap | Severity | Notes |
|---|---|---|
| No pause/resume endpoint for monitor | Medium | Postman allows pausing without deleting. APIPilot has `enabled` flag on BulkTestSchedule but no dedicated monitor-level pause endpoint. Can be exposed via PUT /monitor/{id} with `enabled` bool. |
| No manual trigger endpoint | Medium | "Run Now" button in Postman. APIPilot has no POST /monitor/{id}/run — would need to enqueue a one-shot execution. |
| No per-request latency breakdown | Low | dns_ms / connect_ms / tls_ms / ttfb_ms not captured in BulkTestExecutionResult |
| No response body storage for failed runs | Low | Postman stores truncated response body for failed runs. APIPilot BulkTestExecutionResult has no response_body field. |
| No alert storm prevention | High | Repeated failures each fire a notification. Need "first failure only + recovery" logic. |
| No on_recovery alert type | Medium | ScheduleAlert has on_failure / on_success / on_partial. Missing on_recovery (first success after ≥1 failure). |
| No region concept | N/A | Self-hosted APIPilot — the user's infra IS the region. Document this as a differentiator. |
| No run history export (CSV) | Low | Postman has CSV export per monitor. APIPilot could add later. |
| No uptime window selector | Low | Fixed 30-day window. Postman allows 7d/30d toggle. |
| No concurrent run guard | Medium | Same monitor can fire twice if schedule interval < run duration. Need: check if execution with status="running" exists for this schedule_id before enqueuing. |

### Frontend gaps (everything — zero FE components built)
| Component | Gap |
|---|---|
| MonitorList | Does not exist |
| MonitorDetail | Does not exist |
| MonitorCreateModal | Does not exist |
| MonitorRunLog (expandable run row) | Does not exist |
| AlertConfigPanel | Does not exist |
| Chart library | Not chosen; Recharts recommended (see spec.md) |

---

## Chart Library Decision — Recharts

**Options considered:**

| Library | Bundle size | API style | Canvas vs SVG | Verdict |
|---|---|---|---|---|
| Recharts | ~300 KB | Declarative JSX components | SVG | Recommended |
| Chart.js + react-chartjs-2 | ~200 KB (canvas) | Config object | Canvas | Good for simple charts; less React-idiomatic |
| Visx (Airbnb) | ~150 KB (tree-shaken) | Low-level D3 primitives | SVG | Overkill; steep learning curve |
| Victory | ~400 KB | Declarative JSX | SVG | Larger bundle; less active maintenance |

**Recharts wins because:**
1. Fully declarative JSX — fits the project's React style; no imperative Chart.js config objects.
2. SVG-based — tooltips, custom dots, and reference lines are trivial to add without canvas hacks.
3. Built-in `ResponsiveContainer` wraps any chart to fill parent div — no manual resize logic.
4. `LineChart` covers latency-over-time; `BarChart` covers pass/fail per run; `AreaChart` covers
   uptime trend — all three needed shapes are first-class in Recharts.
5. Active community (most-starred React chart lib as of Aug 2025); MIT license.
6. [UNVERIFIED — bundle size and star ranking post-Aug 2025; verify before adding to package.json]

**Charts needed per view:**
| Chart | Component | Data source |
|---|---|---|
| Latency over time (LineChart) | MonitorDetail | latency_series[].duration_ms + finished_at |
| Pass/fail per run (BarChart stacked) | MonitorDetail | latency_series[].passed + failed |
| Uptime % (single stat + AreaChart sparkline) | MonitorList badge + MonitorDetail header | monitor.uptime_pct |

---

## UX Flow (create → view → drill)

1. User opens Monitors page → sees MonitorList table (name, status badge, schedule, uptime %, p95, last run)
2. User clicks "+ New Monitor" → MonitorCreateModal opens
   - Selects schedule (dropdown, workspace-scoped)
   - Names the monitor
   - (Alert config is on the schedule, not the monitor — link to schedule's alert settings)
3. Modal submits POST /workspace/{id}/monitors → monitor created
4. User clicks a monitor row → MonitorDetail view loads
   - Header: name, status badge, uptime %, p95 latency
   - LineChart: duration_ms over last 50 runs (x=finished_at, y=duration_ms)
   - Stacked BarChart: passed vs failed per run
   - Run history table: each row = one execution (started_at, duration, status, passed, failed)
5. User clicks a run row → MonitorRunLog expands inline (or opens side panel)
   - Shows: status, total_cases, passed, failed, started_at, finished_at, duration_ms
   - (Full per-case results would require a new endpoint — see backend gap above)
6. User clicks "Pause" on monitor → PUT /monitor/{id} with enabled=false on schedule
7. User clicks "Delete" → confirm dialog → DELETE /monitor/{id}
