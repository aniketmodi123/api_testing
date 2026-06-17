# Spec — Schedules

STATUS: updated
LAST_CHANGED: 2026-06-16

---

## Overview

Backend is **complete and production-ready**. Scheduler engine polls every 30s, supports 6
frequency types, persists executions + per-case results, fires alerts. No BE changes needed.

Gap: **FE is entirely missing.** No schedule management UI, no run history viewer.

---

## Backend — Current State (shipped, no changes needed)

### Models

**`BulkTestSchedule`** — schedule configuration row:
```
id              INTEGER PK
name            VARCHAR
username        VARCHAR FK → User
workspace_id    INTEGER FK → Workspace
type            ENUM: once | minutely | hourly | daily | weekly | monthly
interval_count  INTEGER   -- every N minutes/hours/days/weeks/months
time            VARCHAR   -- "HH:MM" for daily/weekly/monthly
days_of_week    JSON[]    -- ["monday","wednesday"] for weekly
day_of_month    INTEGER   -- 1-28 for monthly
date_time       TIMESTAMP -- absolute time for "once"
enabled         BOOLEAN
payload         JSONB     -- what to run: {type: "api"|"case", apis: [...]}
next_run        TIMESTAMP
last_run        TIMESTAMP
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

**`BulkTestExecution`** — one run instance:
```
id              INTEGER PK
schedule_id     INTEGER FK → BulkTestSchedule
status          ENUM: running | success | partial | failed
started_at      TIMESTAMP
finished_at     TIMESTAMP
total_cases     INTEGER
passed          INTEGER
failed          INTEGER
duration_ms     INTEGER
error_message   TEXT nullable
```

**`BulkTestResult`** — per-case result within an execution:
```
id              INTEGER PK
execution_id    INTEGER FK → BulkTestExecution
case_id         INTEGER
case_name       VARCHAR
status_code     INTEGER
success         BOOLEAN
failures        JSONB     -- list of failure strings
request         JSONB     -- request snapshot
response        JSONB     -- response snapshot
duration_ms     INTEGER
created_at      TIMESTAMP
```

### Existing Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/schedules` | Create schedule |
| GET | `/schedules` | List all schedules for workspace |
| PUT | `/schedules/{id}` | Update schedule (full replace) |
| DELETE | `/schedules/{id}` | Delete schedule + all executions + results |
| GET | `/schedules/{id}/executions` | List executions with per-case results |
| DELETE | `/schedules/{id}/executions/{exec_id}` | Delete single execution |
| GET | `/schedules/executions/running` | List currently running executions (workspace-wide) |

### Missing Endpoints

| Method | Path | Purpose |
|---|---|---|
| PATCH | `/schedules/{id}/toggle` | Enable/disable without full PUT |
| POST | `/schedules/{id}/run-now` | Trigger immediate execution outside schedule |
| GET | `/schedules/{id}` | Get single schedule detail |

### Frequency Types + Constraints

| Type | `interval_count` | `time` | `days_of_week` | `day_of_month` | `date_time` |
|---|---|---|---|---|---|
| `once` | — | — | — | — | required |
| `minutely` | min 20 (enforced) | — | — | — | — |
| `hourly` | min 1 | `"HH:MM"` (minute only used) | — | — | — |
| `daily` | min 1 | `"HH:MM"` | — | — | — |
| `weekly` | min 1 | `"HH:MM"` | required (1+ days) | — | — |
| `monthly` | min 1 | `"HH:MM"` | — | 1–28 | — |

Min interval for `minutely` = 20 minutes (enforced in engine). `day_of_month` capped at 28 to
avoid month-end edge cases.

---

## Frontend

### Component Inventory

| Component | Location | Purpose |
|---|---|---|
| `SchedulesPage` | `src/pages/SchedulesPage.tsx` | Full-page route: schedule list + detail panel |
| `ScheduleList` | `src/components/schedules/ScheduleList.tsx` | Left panel: list of schedules with status badges |
| `ScheduleCard` | `src/components/schedules/ScheduleCard.tsx` | Single schedule row: name, type, next run, enabled toggle, actions |
| `ScheduleFormModal` | `src/components/schedules/ScheduleFormModal.tsx` | Create / edit schedule: all fields, frequency selector |
| `FrequencySelector` | `src/components/schedules/FrequencySelector.tsx` | Step-by-step frequency config (type → interval → time → days) |
| `SchedulePayloadPicker` | `src/components/schedules/SchedulePayloadPicker.tsx` | Pick what to run: file tree multi-select (API files or case groups) |
| `ScheduleDetailPanel` | `src/components/schedules/ScheduleDetailPanel.tsx` | Right panel: summary + execution history for selected schedule |
| `ExecutionHistoryList` | `src/components/schedules/ExecutionHistoryList.tsx` | Paginated list of past executions with pass/fail bar |
| `ExecutionResultDrawer` | `src/components/schedules/ExecutionResultDrawer.tsx` | Slide-in: per-case result table for one execution |
| `RunNowButton` | `src/components/schedules/RunNowButton.tsx` | Trigger immediate run; shows spinner; refreshes execution list |

### TypeScript Interfaces

```typescript
interface Schedule {
  id: number;
  name: string;
  type: 'once' | 'minutely' | 'hourly' | 'daily' | 'weekly' | 'monthly';
  interval_count: number | null;
  time: string | null;          // "HH:MM"
  days_of_week: string[] | null;
  day_of_month: number | null;
  date_time: string | null;     // ISO for "once"
  enabled: boolean;
  payload: SchedulePayload;
  next_run: string | null;
  last_run: string | null;
  created_at: string;
  updated_at: string | null;
  executions_count: number;
}

interface SchedulePayload {
  type: 'api' | 'case';
  apis: number[] | Array<{ file_id: number; case_ids: number[] }>;
}

interface Execution {
  id: number;
  schedule_id: number;
  status: 'running' | 'success' | 'partial' | 'failed';
  started_at: string;
  finished_at: string | null;
  total_cases: number;
  passed: number;
  failed: number;
  duration_ms: number;
  error_message: string | null;
  results?: CaseResult[];
}

interface CaseResult {
  id: number;
  case_id: number;
  case_name: string;
  status_code: number;
  success: boolean;
  failures: string[];
  duration_ms: number;
}

interface FrequencySelectorProps {
  value: Pick<Schedule, 'type' | 'interval_count' | 'time' | 'days_of_week' | 'day_of_month' | 'date_time'>;
  onChange: (v: FrequencySelectorProps['value']) => void;
}
```

### Component Render Descriptions

**`SchedulesPage`**: Two-column layout. Left (~320px): `ScheduleList` + "New Schedule" button. Right: `ScheduleDetailPanel` for selected schedule (empty state when none selected).

**`ScheduleList`**: Scrollable list of `ScheduleCard` rows. "New Schedule" CTA at top. Sort by `created_at` desc. Shows running-indicator pulse dot when any execution is running.

**`ScheduleCard`**: Row shows: name, frequency summary (e.g. "Every 30 min"), next run relative time (e.g. "in 4 minutes"), enabled toggle (PATCH `/schedules/{id}/toggle`), kebab menu (Edit / Run Now / Delete). Status badge: Active (green) / Paused (grey) / Running (pulse).

**`ScheduleFormModal`**: Two-section form. Section 1: name input + `FrequencySelector`. Section 2: `SchedulePayloadPicker`. Footer: Cancel / Save. On edit, pre-fills all fields. Validates before submit: weekly requires ≥1 day, once requires future datetime, minutely enforces ≥20.

**`FrequencySelector`**: Dropdown for type. Conditional fields appear based on type:
- `minutely`: number input "Every N minutes" (min 20)
- `hourly`: number input "Every N hours" + time picker (minute only)
- `daily`: number input "Every N days" + time picker
- `weekly`: day-of-week pill toggles (Mon–Sun, multi-select) + time picker
- `monthly`: number input "Day N of month" (1–28) + time picker
- `once`: datetime-local input

**`SchedulePayloadPicker`**: Toggle: "All APIs in files" vs "Specific test cases". Tree of workspace files (checkboxes). For case mode: expand file → check individual cases. Shows selected count badge.

**`ScheduleDetailPanel`**: Top: schedule name + frequency summary + next-run chip + Run Now button. Below: `ExecutionHistoryList`.

**`ExecutionHistoryList`**: Table rows: started_at, duration, status badge, pass/fail bar (green/red ratio), "View" button → opens `ExecutionResultDrawer`. Pagination: load 20 at a time. Polling: refresh every 5s when any execution status is `running`.

**`ExecutionResultDrawer`**: Slide-in from right. Header: execution summary (total/passed/failed/duration). Body: table of `CaseResult` rows — case name, status code, duration, pass/fail badge, failures list expandable. Searchable by case name.

### API Calls

| Action | Method | URL | When |
|---|---|---|---|
| List schedules | GET | `/schedules` | Page load |
| Create schedule | POST | `/schedules` | Form submit (new) |
| Update schedule | PUT | `/schedules/{id}` | Form submit (edit) |
| Toggle enable | PATCH | `/schedules/{id}/toggle` | Toggle switch |
| Delete schedule | DELETE | `/schedules/{id}` | Kebab → Delete |
| Run now | POST | `/schedules/{id}/run-now` | Run Now button |
| Load executions | GET | `/schedules/{id}/executions` | Schedule selected / poll |
| Delete execution | DELETE | `/schedules/{id}/executions/{eid}` | Execution row → Delete |
| Poll running | GET | `/schedules/executions/running` | 5s poll when running detected |

---

## Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Min minutely interval | 20 min (enforced BE + FE) | Prevent abuse; matches common monitor floor |
| 2 | day_of_month cap | 28 | Avoids Feb 29/30/31 edge cases; simplest safe cap |
| 3 | Execution polling | 5s interval, client-side | Simple; SSE overkill for schedule dashboard |
| 4 | Payload picker | File tree multi-select | Matches collection-runner pattern; familiar UX |
| 5 | SKIP LOCKED | Deferred | Single-worker now; add when horizontal scaling needed |
| 6 | Timezone | Store naive UTC; display in browser local time | Engine runs UTC; `toLocaleDateString()` handles display |

---

## Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | `once` schedule fires, `enabled` auto-set false | Card shows "Completed" badge; no toggle shown |
| 2 | Weekly schedule with no days_of_week | Blocked at FE (validate before submit); BE also returns null next_run |
| 3 | Execution still running when delete attempted | Show "Cannot delete running execution" toast; block DELETE call |
| 4 | Run Now while execution already running | Show "Already running" toast; poll until finished then allow again |
| 5 | Schedule next_run is null (bad config) | Show "Misconfigured" warning chip on card; prompt to edit |
| 6 | Execution list grows unbounded | Paginate at 20; add "Clear all completed" bulk action |
| 7 | Scheduler engine down (Docker crash) | Executions stay "running" forever; add stale-execution cleanup: mark `running` rows as `failed` if `started_at` > 30min ago |

---

## Deferred

| Item | Reason |
|---|---|
| SKIP LOCKED (multi-worker guard) | Single-worker deployment; add when scaling |
| Timezone picker per schedule | Store UTC for now; add timezone field + conversion in V2 |
| Email notification config in UI | Alerts feature covers this (see alerts/spec.md) |
| Schedule templates (presets) | P3 nice-to-have |
| Execution log streaming (SSE) | Batch results sufficient for now |
