# Spec — Monitoring

STATUS: Research-complete
LAST_CHANGED: 2026-06-16
SOURCE: Postman Learning Center (live fetch 2026-06-16) + prior phase spec

## Goal

Run collections on a schedule (or via webhook) from the cloud, track uptime/latency,
and alert on failures. APIPilot differentiator: unlimited monitors on free tier (Postman gates
multi-region and minute-level scheduling behind paid plans).

---

## 1. Postman Feature Catalog (ground truth)

### 1.1 Monitor Types
| Type | Description | APIPilot scope |
|---|---|---|
| Scheduled monitor | Runs a collection on a cron-like schedule | In scope |
| Webhook-triggered monitor | `POST /webhooks` creates a monitor that fires on HTTP trigger; custom payload injected as collection vars | In scope (link to schedules webhook endpoint) |
| CLI-triggered monitor | `postman collection run --reporter-cli` piped to Postman cloud | Out of scope |
| Private API Monitor | On-prem runner agent for internal APIs | Out of scope (Phase 2+) |
| Static IP monitor | Dedicated egress IPs for firewalled APIs | Out of scope |

### 1.2 Schedule Frequencies (Postman)
| Interval | Plan gate |
|---|---|
| Every 1 min | Enterprise |
| Every 5 min | Paid |
| Every 15/30 min | All (paid min-level) |
| Hourly | All |
| Daily (specific time) | All |
| Weekly (specific day+time) | All |

APIPilot schedule options: 5 min, 15 min, 30 min, 1 h, 6 h, 12 h, 24 h, weekly.
(1-min interval kept for potential Enterprise tier.)

### 1.3 Regions
Postman offers 19 regions (Africa, 6× Asia-Pacific, Australia, Canada, 5× Europe, India,
2× Japan, South America, UK, US). Free plan: region auto-selected. Paid: manual selection.
Each request × each region = one monitor API call.

APIPilot: single region (server location). Multi-region is deferred (Phase 2).

### 1.4 Notifications / Alerting

**Email**
- Up to 5 recipients per monitor
- Configurable: alert on every failure OR after N consecutive failures (default 3)
- Recovery notification when first success follows failures
- Daily/weekly summary digest (optional)

**Slack / Teams / webhook**
- Postman sends payload to configured webhook URL on failure + recovery
- Alert storm prevention: notify on first failure in a streak, silence until recovery

**APIPilot alert implementation**
- Email + generic outbound webhook (JSON payload)
- Consecutive-failure threshold configurable (1–10, default 3)
- Recovery notification on first success after failure streak
- Daily digest: summary of all monitors for workspace (optional toggle)

### 1.5 Run Configuration Options
| Option | Detail |
|---|---|
| Collection | Single collection required |
| Environment | Single env (optional) |
| Data file | CSV or JSON; max 1 MB; 50 rows/objects (paid Postman); APIPilot same limit |
| Retry on failure | Re-runs a failed request once; may count as extra usage |
| Request delay | Pre-request sleep (ms) |
| Redirect follow | Default on |
| SSL validation | Default on; can disable per monitor |
| Timeout per run | Free: 10 min; Paid: 15 min. APIPilot: 10 min (single tier) |

### 1.6 Monitor Management Operations
| Action | UI | API |
|---|---|---|
| Create | CreateMonitorModal | POST /schedules |
| Edit | EditMonitorModal | PUT /schedules/{id} |
| Pause | context menu → Pause | PATCH /schedules/{id} {enabled: false} |
| Resume | context menu → Resume | PATCH /schedules/{id} {enabled: true} |
| Run now (manual) | "Run" button on detail view | POST /schedules/{id}/run |
| Delete | context menu → Delete | DELETE /schedules/{id} (deletes all run history) |
| Duplicate | — | POST /schedules (copy fields) |

### 1.7 Dashboard Metrics (Postman)
- Per-monitor: uptime % (24 h, 7 d, 30 d), avg response time, failed test %
- Run chart: bar/line chart — avg response time per run; failed-test overlay
- Per-request breakdown: response code, time, size per individual request
- Console log: `console.log` / `console.warn` from test scripts; searchable; 6-month retention
- Filter by: run type (scheduled/manual/webhook), result (success/failure/error/abort), region
- Hover on chart bar → exact response time + failed % tooltip

### 1.8 Usage / Plan Gating (Postman)
- Free: monitors auto-pause at monthly call limit
- Paid: optional overage billing (pay-as-you-go per call above limit)
- Unused calls do not roll over
- APIPilot: unlimited calls, no gating (key differentiator)

---

## 2. Backend Specification

### 2.1 DB Models

#### `Schedule` (existing)
```python
id: UUID PK
workspace_id: UUID FK
collection_id: UUID FK
environment_id: UUID FK nullable
name: str
enabled: bool default True
type: str  # 'minutely' | 'hourly' | 'daily' | 'weekly'
interval_count: int
cron_expression: str nullable  # derived, stored for scheduler
next_run: datetime UTC nullable
last_run: datetime UTC nullable
timeout_ms: int default 600_000
retry_on_failure: bool default False
request_delay_ms: int default 0
follow_redirects: bool default True
ssl_validation: bool default True
created_at: datetime UTC
updated_at: datetime UTC
```

#### `ScheduleAlert` (new — per-monitor alert config)
```
id: UUID PK
schedule_id: UUID FK → Schedule
channel: str  # 'email' | 'webhook' | 'slack'
target: str   # email address OR webhook URL
consecutive_failures_threshold: int default 3
notify_on_recovery: bool default True
daily_digest: bool default False
created_at: datetime UTC
```

#### `MonitorRollup` (existing — pre-aggregated stats)
```
id: UUID PK
schedule_id: UUID FK
period: str  # '24h' | '7d' | '30d'
uptime_pct: Decimal(5,2)
avg_latency_ms: int
p95_latency_ms: int
error_rate_pct: Decimal(5,2)
computed_at: datetime UTC
```

#### `ScheduleExecution` (existing run history)
```
id: UUID PK
schedule_id: UUID FK
run_type: str  # 'scheduled' | 'manual' | 'webhook'
status: str    # 'success' | 'failure' | 'error' | 'abort'
started_at: datetime UTC
duration_ms: int
region: str default 'us-east-1'
test_passed: int
test_failed: int
console_log: JSON nullable  # list of {level, message, timestamp}
request_results: JSON       # list of {request_id, name, status_code, duration_ms, size_bytes, test_results[]}
```

### 2.2 Endpoints

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST | `/schedules` | editor | Create monitor |
| GET | `/schedules` | viewer | List monitors for workspace |
| GET | `/schedules/{id}` | viewer | Get monitor detail + latest stats |
| PUT | `/schedules/{id}` | editor | Update monitor config |
| PATCH | `/schedules/{id}` | editor | Pause / resume (sets `enabled`) |
| DELETE | `/schedules/{id}` | editor | Delete monitor + all run history |
| POST | `/schedules/{id}/run` | editor | Manual trigger — run now |
| GET | `/schedules/{id}/executions` | viewer | Paginated run history |
| GET | `/schedules/{id}/executions/{exec_id}` | viewer | Single execution detail (console log, per-request) |
| GET | `/monitors/rollup` | viewer | Workspace-wide aggregated stats (all monitors) |
| POST | `/schedules/{id}/alerts` | editor | Add alert channel to monitor |
| GET | `/schedules/{id}/alerts` | viewer | List alert channels for monitor |
| DELETE | `/schedules/{id}/alerts/{alert_id}` | editor | Remove alert channel |

### 2.3 Business Logic

**Scheduler loop** (`asyncio` background task)
1. Every 30 s: query `Schedule WHERE enabled=true AND next_run <= now()`
2. For each due schedule: enqueue `run_execution_task(schedule_id)`
3. `compute_next_run(type, interval_count, last_run)` — snaps to clean interval boundary to prevent drift

**Alert storm prevention**
- Track consecutive failure count in `Schedule.consecutive_failure_count: int default 0`
- On failure: increment count; notify only if count == threshold (first breach)
- On success after failures: send recovery email; reset count to 0
- On success (no prior failures): no notification

**console_log capture**
- Test script `console.log` / `console.warn` / `console.error` captured during execution
- Stored as JSON array in `ScheduleExecution.console_log`
- Retained for 6 months then hard-deleted (background cleanup job)

**Retry on failure**
- If `retry_on_failure=True` and a request returns non-2xx: re-run that single request once
- Retry result overwrites the failure result in `request_results`
- Retry is counted as additional execution time toward timeout

### 2.4 Modified Files
| File | Change |
|---|---|
| `src/models/schedule.py` | Add `retry_on_failure`, `request_delay_ms`, `follow_redirects`, `ssl_validation`, `consecutive_failure_count` fields |
| `src/models/schedule_alert.py` | New model `ScheduleAlert` |
| `src/models/schedule_execution.py` | Add `run_type`, `region`, `console_log` fields |
| `src/routers/schedules.py` | Add PATCH, POST run, alert CRUD endpoints |
| `src/services/monitor_runner.py` | Add console log capture, retry logic, alert storm prevention |
| `src/services/notification_service.py` | Add recovery notification, webhook channel, daily digest |

---

## 3. Frontend Specification

### 3.1 Library Decisions
| Decision | Choice | Reason |
|---|---|---|
| Charting | Recharts | Composable React chart lib; LineChart + BarChart + Tooltip sufficient; simpler API than D3/Chart.js |
| State | Redux slice `monitorsSlice` | Consistent with rest of app |

### 3.2 Component Inventory

| Component | Location | Purpose |
|---|---|---|
| `MonitorDashboardLayout` | `features/monitors/MonitorDashboardLayout.tsx` | Root layout: summary bar + monitor list |
| `MonitorSummaryBar` | `features/monitors/MonitorSummaryBar.tsx` | Workspace-wide avg uptime, avg latency, total failures (24 h) |
| `MonitorListView` | `features/monitors/MonitorListView.tsx` | Table of all monitors with sort/filter |
| `MonitorListItem` | `features/monitors/MonitorListItem.tsx` | Single row: name, status badge, uptime %, avg latency, mini sparkline |
| `MonitorDetailView` | `features/monitors/MonitorDetailView.tsx` | Detail page: metrics header + latency chart + run history |
| `MonitorMetricsHeader` | `features/monitors/MonitorMetricsHeader.tsx` | Cards: uptime 24h/7d/30d, P95 latency, error rate |
| `MonitorLatencyChart` | `features/monitors/MonitorLatencyChart.tsx` | Recharts LineChart: response time per run; failed runs = red dot |
| `MonitorRunHistory` | `features/monitors/MonitorRunHistory.tsx` | Paginated run table; expandable rows → per-request results |
| `MonitorRunDetail` | `features/monitors/MonitorRunDetail.tsx` | Expanded row: per-request table + console log tab |
| `CreateMonitorModal` | `features/monitors/CreateMonitorModal.tsx` | 3-step modal: select collection → schedule config → alert config |
| `EditMonitorModal` | `features/monitors/EditMonitorModal.tsx` | Same form pre-populated from existing monitor |
| `MonitorAlertConfig` | `features/monitors/MonitorAlertConfig.tsx` | Alert channel form (email / webhook), threshold slider, recovery toggle |

### 3.3 TypeScript Interfaces

```typescript
interface Monitor {
  id: string;
  name: string;
  enabled: boolean;
  collection_id: string;
  collection_name: string;
  environment_id: string | null;
  environment_name: string | null;
  type: 'minutely' | 'hourly' | 'daily' | 'weekly';
  interval_count: number;
  next_run: string | null;  // ISO UTC
  last_run: string | null;
  retry_on_failure: boolean;
  ssl_validation: boolean;
  stats: MonitorStats | null;
}

interface MonitorStats {
  uptime_24h: number;    // percentage 0–100
  uptime_7d: number;
  uptime_30d: number;
  avg_latency_24h: number;  // ms
  p95_latency_24h: number;
  error_rate_24h: number;   // percentage
}

interface MonitorExecution {
  id: string;
  schedule_id: string;
  run_type: 'scheduled' | 'manual' | 'webhook';
  status: 'success' | 'failure' | 'error' | 'abort';
  started_at: string;   // ISO UTC
  duration_ms: number;
  test_passed: number;
  test_failed: number;
  request_results: RequestResult[];
  console_log: ConsoleEntry[] | null;
}

interface RequestResult {
  request_id: string;
  name: string;
  status_code: number;
  duration_ms: number;
  size_bytes: number;
  test_results: { name: string; passed: boolean; error: string | null }[];
}

interface ConsoleEntry {
  level: 'log' | 'warn' | 'error';
  message: string;
  timestamp: string;
}

interface MonitorAlert {
  id: string;
  schedule_id: string;
  channel: 'email' | 'webhook';
  target: string;
  consecutive_failures_threshold: number;
  notify_on_recovery: boolean;
  daily_digest: boolean;
}
```

### 3.4 API Calls

| Action | Method | URL | When |
|---|---|---|---|
| Load all monitors | GET | `/schedules?workspace_id=X` | MonitorListView mount |
| Load workspace stats | GET | `/monitors/rollup` | MonitorSummaryBar mount |
| Load monitor detail | GET | `/schedules/{id}` | MonitorDetailView mount |
| Load run history | GET | `/schedules/{id}/executions?page=1` | MonitorRunHistory mount |
| Load execution detail | GET | `/schedules/{id}/executions/{exec_id}` | Row expand |
| Create monitor | POST | `/schedules` | CreateMonitorModal submit |
| Edit monitor | PUT | `/schedules/{id}` | EditMonitorModal submit |
| Pause / Resume | PATCH | `/schedules/{id}` | Context menu action |
| Run now | POST | `/schedules/{id}/run` | "Run" button |
| Delete monitor | DELETE | `/schedules/{id}` | Context menu confirm |
| Add alert | POST | `/schedules/{id}/alerts` | MonitorAlertConfig submit |
| List alerts | GET | `/schedules/{id}/alerts` | EditMonitorModal → alert tab |
| Delete alert | DELETE | `/schedules/{id}/alerts/{alert_id}` | Alert remove button |

### 3.5 State Shape (Redux)

```typescript
interface MonitorsState {
  byId: Record<string, Monitor>;
  allIds: string[];
  workspaceStats: WorkspaceRollup | null;
  loading: boolean;
  error: string | null;
}

interface MonitorRunsState {
  byMonitorId: Record<string, {
    runs: MonitorExecution[];
    page: number;
    hasMore: boolean;
    loading: boolean;
  }>;
}
```

### 3.6 UX Decisions
- List view: color-coded status badge (green Healthy / red Failing / grey Paused)
- Mini sparkline in list row: last 10 run latencies (Recharts `<Sparkline>`)
- Detail chart: time-period selector (24h / 7d / 30d); failed runs rendered as red dots on line
- Console log tab: searchable; highlight cycles through matches; monospace font
- CreateMonitorModal step 3 (alerts): allow adding multiple channels (max 5 emails)
- Pause action: confirm dialog explaining run history is preserved; Delete warns history is lost

---

## 4. Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Scheduler engine | Custom asyncio loop | No Celery dep; simple for current scale |
| 2 | Runner reuse | `bulk_run_cases` | DRY — existing collection runner |
| 3 | Stats storage | `MonitorRollup` pre-aggregated | Fast dashboard loads; no expensive aggregation on read |
| 4 | Notification engine | `notification_service` | Pluggable channels |
| 5 | Alert storm prevention | First-failure-only + recovery | Matches Postman UX; reduces noise |
| 6 | console_log retention | 6 months hard-delete | Matches Postman; bounded storage cost |
| 7 | Multi-region | Deferred (Phase 2) | Single-region sufficient for v1 |
| 8 | Private location agent | Deferred (Phase 2+) | Requires separate runner infra |
| 9 | Charting library | Recharts | Composable, React-native, simpler than D3 |
| 10 | Data file upload | CSV/JSON ≤1 MB, ≤50 rows | Matches Postman paid-tier limits; APIPilot offers on free |

---

## 5. Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | Schedule drift on server restart | `compute_next_run` snaps to clean interval; never re-uses last_run blindly |
| 2 | Thundering herd (many monitors due at same tick) | Stagger with random 0–5 s jitter per schedule |
| 3 | Long-running monitor exceeds timeout | `asyncio.wait_for(run_task, timeout=600)` in runner; status → 'abort' |
| 4 | Alert recipient list > 5 | Validate at POST /alerts; 400 if would exceed 5 email channels |
| 5 | Retry doubles execution time near timeout | Retry only if remaining time > 30 s; skip retry if near timeout |
| 6 | `console.log` output too large | Cap at 512 KB per execution; truncate oldest entries |
| 7 | Monitor deleted while running | Runner checks `enabled` flag post-execution; discards result silently |
| 8 | Empty collection (no requests) | Return 400 at create time; cannot monitor an empty collection |
| 9 | Environment deleted after monitor created | `environment_id` set to null; monitor runs without env; notify owner |
| 10 | Webhook trigger with custom payload | Parse request body at webhook endpoint; inject as collection vars before run |

---

## 6. Deferred Items

| Item | Reason |
|---|---|
| Multi-region execution | Requires distributed runner infra; Phase 2 |
| Private API monitoring (on-prem agent) | Separate product surface; Phase 2+ |
| Static egress IPs | Infrastructure dependency |
| Usage quotas / overage billing | APIPilot differentiator: unlimited free |
| 1-minute interval monitoring | Infra cost; revisit for enterprise tier |
| Read-only shareable monitor report URL | Nice-to-have post-launch |
| CLI-triggered monitor runs | Out of scope for web app |
