# Spec — Alerts

STATUS: updated
LAST_CHANGED: 2026-06-16

---

## Overview

Backend is **complete**. CRUD endpoints + email (SMTP) + webhook (Slack-compatible) dispatch
all shipped and working. Gap is **100% frontend** — no UI to create, edit, or delete alerts.
Users must call the API directly.

---

## Backend — Current State (shipped, no changes needed)

### `ScheduleAlert` Model

```
id              INTEGER PK
schedule_id     INTEGER FK → BulkTestSchedule CASCADE DELETE
type            VARCHAR(20)   -- "email" | "webhook"
target          VARCHAR(500)  -- email address or webhook URL
on_failure      BOOLEAN       default true
on_success      BOOLEAN       default false
on_partial      BOOLEAN       default true
created_at      DATETIME
```

### Existing Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/schedules/{schedule_id}/alerts` | Create alert |
| GET | `/schedules/{schedule_id}/alerts` | List alerts for schedule |
| PUT | `/schedules/{schedule_id}/alerts/{alert_id}` | Update alert flags/target |
| DELETE | `/schedules/{schedule_id}/alerts/{alert_id}` | Delete alert |

### Dispatch Logic (notification_service.py)

- Runs fire-and-forget after every `BulkTestExecution` completes
- Email: SMTP via env vars (`SMTP_SERVER`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`)
- Webhook: HTTP POST with Slack-compatible `blocks` payload
- Trigger filter: `on_failure` fires on `status="failed"`, `on_partial` on `status="partial"`, `on_success` on `status="success"`
- Failures logged, never re-raised (fire-and-forget)

### Missing Backend Items

| Item | Gap |
|---|---|
| Monitor-level alerts | Currently only schedule-level; no `MonitorAlert` model. Monitor is a separate entity — needs own alert CRUD tied to `Monitor.id` |
| Slack/Teams native integration | Current webhook is generic HTTP POST; no OAuth-based Slack app integration |
| Alert delivery log | No record of sent/failed alert attempts; hard to debug |

---

## Frontend

### Component Inventory

| Component | Location | Purpose |
|---|---|---|
| `AlertsSection` | `src/components/alerts/AlertsSection.tsx` | Collapsible section inside ScheduleDetailPanel; shows alert list + add button |
| `AlertRow` | `src/components/alerts/AlertRow.tsx` | Single alert row: type icon, target, trigger toggles, delete |
| `AddAlertModal` | `src/components/alerts/AddAlertModal.tsx` | Create/edit alert: type selector, target input, trigger checkboxes |
| `AlertTypeIcon` | `src/components/alerts/AlertTypeIcon.tsx` | Email or webhook icon chip |
| `TriggerFlagToggles` | `src/components/alerts/TriggerFlagToggles.tsx` | Three toggle chips: On Failure / On Partial / On Success |

### TypeScript Interfaces

```typescript
interface ScheduleAlertRecord {
  id: number;
  schedule_id: number;
  type: 'email' | 'webhook';
  target: string;
  on_failure: boolean;
  on_success: boolean;
  on_partial: boolean;
  created_at: string;
}

interface AlertsState {
  alerts: ScheduleAlertRecord[];
  loading: boolean;
  error: string | null;
}

interface AddAlertModalProps {
  scheduleId: number;
  existing?: ScheduleAlertRecord;   // when editing
  onClose: () => void;
  onSaved: (alert: ScheduleAlertRecord) => void;
}

interface TriggerFlagTogglesProps {
  onFailure: boolean;
  onPartial: boolean;
  onSuccess: boolean;
  onChange: (flags: { onFailure: boolean; onPartial: boolean; onSuccess: boolean }) => void;
  readOnly?: boolean;
}
```

### Component Render Descriptions

**`AlertsSection`**: Placed inside `ScheduleDetailPanel` below execution history. Header: "Notifications" + count badge + "Add" button. Collapsed by default; expand chevron. List of `AlertRow` components. Empty state: "No alerts configured — add one to get notified when this schedule runs."

**`AlertRow`**: One row per alert. Left: `AlertTypeIcon` (envelope for email, plug for webhook) + truncated target (email address or domain of webhook URL). Center: `TriggerFlagToggles` in read-only mode showing active flags as coloured chips. Right: Edit (pencil → opens `AddAlertModal` pre-filled) + Delete (trash → confirm inline).

**`AddAlertModal`**: Two-step form.
- Step 1: Type selector — two large cards: "Email" / "Webhook (Slack/Teams/custom)". Selected card highlighted.
- Step 2 (email): Email address input + `TriggerFlagToggles`. Validate: must be valid email format.
- Step 2 (webhook): URL input + `TriggerFlagToggles`. Validate: must be `https://` URL.
- Footer: Cancel / Save. On save → POST or PUT depending on `existing` prop.

**`TriggerFlagToggles`**: Three toggle chips in a row:
- "On Failure" (red) — default ON
- "On Partial" (amber) — default ON  
- "On Success" (green) — default OFF

At least one must be active (validate before save).

**`AlertTypeIcon`**: Small badge: envelope icon + "Email" label for email type; chain-link icon + "Webhook" for webhook.

### API Calls

| Action | Method | URL | When |
|---|---|---|---|
| List alerts | GET | `/schedules/{id}/alerts` | AlertsSection expands |
| Create alert | POST | `/schedules/{id}/alerts` | AddAlertModal save (new) |
| Update alert | PUT | `/schedules/{id}/alerts/{alert_id}` | AddAlertModal save (edit) |
| Delete alert | DELETE | `/schedules/{id}/alerts/{alert_id}` | Delete confirm |

---

## Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Alert scope | Schedule-level only (V1) | Monitor-level alerts deferred; same model can be extended later |
| 2 | Webhook format | Slack-compatible `blocks` | Works with Slack, Teams (via connector), and any webhook receiver |
| 3 | Email delivery | SMTP (env-configured) | Simple; no third-party email service dependency |
| 4 | Delivery log | Deferred | Low priority; app logs cover debugging for now |
| 5 | Slack OAuth app | Deferred | Generic webhook covers the use case without OAuth complexity |
| 6 | Min 1 trigger flag | Enforced FE + implied by BE | Alert with all flags false would never fire — useless row |

---

## Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | All trigger flags unchecked | Block save: "Select at least one trigger condition" |
| 2 | Invalid email format | Validate with simple regex before POST |
| 3 | Webhook URL is `http://` not `https://` | Warn but allow (internal URLs may be HTTP); don't hard-block |
| 4 | SMTP not configured (no env vars) | Email alert skipped silently on dispatch; show warning in UI: "Email delivery requires SMTP configuration" |
| 5 | Webhook URL returns non-2xx | Logged server-side; no FE feedback (fire-and-forget) |
| 6 | Schedule deleted | Alerts cascade-delete (FK ondelete=CASCADE); no orphan cleanup needed |
| 7 | Multiple alerts for same target | Allow; no unique constraint; user may want separate triggers |

---

## Deferred

| Item | Reason |
|---|---|
| Monitor-level alerts (`MonitorAlert` model) | Needs separate model tied to Monitor.id; add when monitor FE is built |
| Slack OAuth app integration | Generic webhook sufficient for V1 |
| Alert delivery log table | P3; app logs cover debugging |
| PagerDuty / OpsGenie integrations | Enterprise integrations; P3 |
| Alert cooldown / storm prevention | No burst logic in current engine; deferred (noted in monitoring spec) |
