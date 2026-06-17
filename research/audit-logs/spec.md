# Spec — Audit Logs

STATUS: Research complete
LAST_CHANGED: 2026-06-16
SOURCE: phases/phase_2_audit_rbac/spec.md + live research 2026-06-16

---

## 1. Goal

Provide administrators with a filterable, paginated, exportable view of all significant user and system actions within a workspace for security, compliance, and incident investigation.

---

## 2. Postman Feature Parity

| Postman Feature | APIPilot Scope |
|---|---|
| Audit log dashboard (Team → Audit Logs) | Yes |
| Filter by date range, event type, actor | Yes |
| Paginated log table | Yes — cursor-based |
| Per-entry: actor, event name, description, IP, timestamp | Yes |
| Export as CSV (emailed download link) | Deferred (no email infra yet) |
| API access to audit logs | Yes — existing `GET /audit-logs` extended |
| 180-day retention | Yes |
| SIEM integration (webhook push) | Deferred |
| Plan gating (Enterprise in Postman) | APIPilot: admin role only |
| Resource-level events (collections, envs, workspaces) | Yes — see event catalog |

---

## 3. Audit Event Catalog

APIPilot must log these events. Event action strings use `resource.verb` dot notation.

### 3.1 Auth / Session Events

| Action | Description |
|---|---|
| `user.login` | User signed in |
| `user.logout` | User signed out |
| `user.login_failed` | Failed sign-in attempt |
| `user.password_changed` | User changed password |
| `user.mfa_enabled` | User enabled MFA |
| `user.mfa_disabled` | User disabled MFA |
| `api_key.created` | API key created |
| `api_key.deleted` | API key deleted |

### 3.2 Team / Member Events

| Action | Description |
|---|---|
| `team.member_invited` | Invite sent to user |
| `team.invite_cancelled` | Pending invite cancelled |
| `team.member_added` | User accepted invite and joined |
| `team.member_removed` | Member removed from team |
| `team.member_role_updated` | Member role changed |
| `team.name_changed` | Team name updated |

### 3.3 Workspace Events

| Action | Description |
|---|---|
| `workspace.created` | Workspace created |
| `workspace.updated` | Workspace renamed or visibility changed |
| `workspace.deleted` | Workspace deleted |
| `workspace.member_added` | User added to workspace |
| `workspace.member_removed` | User removed from workspace |
| `workspace.member_role_updated` | Workspace member role changed |

### 3.4 Collection Events

| Action | Description |
|---|---|
| `collection.created` | Collection created |
| `collection.updated` | Collection name/description changed |
| `collection.deleted` | Collection deleted |
| `collection.forked` | Collection forked |
| `collection.shared` | Collection shared to workspace |
| `collection.exported` | Collection exported |

### 3.5 Environment Events

| Action | Description |
|---|---|
| `environment.created` | Environment created |
| `environment.updated` | Environment variables changed |
| `environment.deleted` | Environment deleted |
| `environment.shared` | Environment shared to workspace |

### 3.6 API / Spec Events

| Action | Description |
|---|---|
| `api.created` | API definition created |
| `api.updated` | API definition updated |
| `api.deleted` | API definition deleted |
| `spec.imported` | OpenAPI spec imported |
| `spec.linted` | Spec linted (governance) |

### 3.7 Governance Events

| Action | Description |
|---|---|
| `governance.ruleset_created` | Governance ruleset created |
| `governance.ruleset_updated` | Ruleset modified |
| `governance.ruleset_deleted` | Ruleset deleted |
| `governance.group_created` | Governance group created |
| `governance.group_updated` | Governance group modified |
| `governance.group_deleted` | Governance group deleted |

### 3.8 Mock Server Events

| Action | Description |
|---|---|
| `mock.created` | Mock server created |
| `mock.updated` | Mock server updated |
| `mock.deleted` | Mock server deleted |

### 3.9 Monitor Events

| Action | Description |
|---|---|
| `monitor.created` | Monitor created |
| `monitor.updated` | Monitor updated |
| `monitor.deleted` | Monitor deleted |
| `monitor.paused` | Monitor paused |
| `monitor.resumed` | Monitor resumed |

---

## 4. Data Model

### AuditLog

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| workspace_id | UUID | FK → Workspace, nullable | NULL for team-level events (login, member invite) |
| actor_user_id | UUID | FK → User, nullable | NULL for system-generated events |
| actor_email | VARCHAR(255) | NOT NULL | Denormalized — preserved even if user deleted |
| actor_ip | INET | nullable | |
| actor_user_agent | TEXT | nullable | |
| action | VARCHAR(100) | NOT NULL | Dot-notation string e.g. `collection.created` |
| resource_type | VARCHAR(50) | nullable | `collection`, `environment`, `workspace`, etc. |
| resource_id | UUID | nullable | ID of the affected resource |
| resource_name | VARCHAR(255) | nullable | Denormalized name at time of event |
| details | JSONB | NOT NULL, DEFAULT '{}' | Additional event-specific data |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Event time |

Indexes:
- `(workspace_id, created_at DESC)` — primary query pattern
- `(actor_user_id, created_at DESC)` — filter by actor
- `(action, created_at DESC)` — filter by event type
- `created_at DESC` — retention cleanup

Retention: rows older than 180 days deleted by scheduled cleanup job.

---

## 5. Backend Specification

### 5.1 Endpoints

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| GET | `/audit-logs` | admin | Paginated + filtered audit log list |
| GET | `/audit-logs/actions` | admin | List all available action strings (for filter dropdown) |
| GET | `/audit-logs/{log_id}` | admin | Get single log entry with full `details` |
| GET | `/audit-logs/export` | admin | Trigger CSV export; returns presigned download URL |

### 5.2 GET `/audit-logs` Query Params

| Param | Type | Default | Notes |
|---|---|---|---|
| `cursor` | string | null | Opaque pagination cursor (encodes `created_at` + `id`) |
| `limit` | int | 50 | Max 200 |
| `since` | ISO8601 | 7 days ago | Start of date range |
| `until` | ISO8601 | now | End of date range |
| `action` | string | null | Filter by action string (exact match) |
| `actor_user_id` | UUID | null | Filter by actor |
| `resource_type` | string | null | Filter by resource type |
| `resource_id` | UUID | null | Filter by specific resource |

### 5.3 GET `/audit-logs` Response Schema

```json
{
  "logs": [
    {
      "id": "uuid",
      "action": "collection.created",
      "actor": {
        "user_id": "uuid",
        "email": "user@example.com",
        "display_name": "Alice"
      },
      "actor_ip": "1.2.3.4",
      "resource_type": "collection",
      "resource_id": "uuid",
      "resource_name": "My API",
      "details": {},
      "created_at": "2026-06-16T10:00:00Z"
    }
  ],
  "next_cursor": "string|null",
  "total": 1200
}
```

`total` is approximate count (COUNT(*) with same filters, capped display at 10,000 for perf).

### 5.4 GET `/audit-logs/export` Response

```json
{
  "download_url": "https://...",
  "expires_at": "2026-06-16T11:00:00Z",
  "row_count": 450
}
```

Export generates CSV in background (Celery task), stores to object storage, returns presigned URL valid 1 hour. Max export: 50,000 rows. If filter would exceed 50,000 rows → 400 with message to narrow date range.

### 5.5 Logging Helper

All audit events written via a single `log_audit_event()` helper (not inline per route):

```python
async def log_audit_event(
    db: AsyncSession,
    action: str,
    actor: User,
    request: Request,
    workspace_id: UUID | None = None,
    resource_type: str | None = None,
    resource_id: UUID | None = None,
    resource_name: str | None = None,
    details: dict = {},
) -> None:
```

- Called as background task (non-blocking) — audit log failure must not fail the primary request.
- IP extracted from `request.client.host` with `X-Forwarded-For` fallback.
- User-agent from `request.headers.get("user-agent")`.

### 5.6 Retention Cleanup

Scheduled job (Celery beat, daily at 02:00 UTC):
```sql
DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '180 days';
```

### 5.7 Modified Files

| File | Change |
|---|---|
| `models/audit_log.py` | AuditLog ORM model |
| `routers/audit_logs.py` | Existing GET endpoint extended + 3 new endpoints |
| `services/audit_log_service.py` | `log_audit_event()` helper + export task |
| `tasks/cleanup.py` | Retention cleanup Celery task |
| `alembic/versions/xxx_audit_log.py` | Migration: add indexes to audit_log table |

---

## 6. Frontend Specification

### 6.1 Library Decisions

| Decision | Choice | Reason |
|---|---|---|
| Date range picker | `react-day-picker` v8 | Lighter than `react-datepicker`; supports range selection natively; no external CSS dependency |
| Table virtualization | `@tanstack/react-virtual` | Audit logs can be large; virtual rows for smooth scroll |
| Pagination | Cursor-based, "Load more" button | Matches API; avoids page-number complexity with live-updated logs |
| State management | Zustand `auditLogStore` | Project standard |
| CSV export | Trigger via API, poll status | No client-side CSV gen; server owns the export |

### 6.2 Component Inventory

| Component | Location | Purpose |
|---|---|---|
| `AuditLogPage` | `pages/audit-logs/` | Top-level page: filter bar + table + export button |
| `AuditLogFilterBar` | `components/audit-logs/` | Filter controls: date range, action dropdown, actor picker |
| `DateRangePicker` | `components/audit-logs/` | Wraps `react-day-picker`; emits `{since, until}` |
| `ActionTypeSelect` | `components/audit-logs/` | Dropdown populated from `GET /audit-logs/actions` |
| `ActorUserSearch` | `components/audit-logs/` | Debounced user search input; resolves to `actor_user_id` |
| `AuditLogTable` | `components/audit-logs/` | Virtualized table: timestamp, actor, action badge, resource, IP |
| `AuditLogRow` | `components/audit-logs/` | Single row; expandable for `details` JSON |
| `ActionBadge` | `components/audit-logs/` | Color-coded pill per action category (auth=blue, team=green, etc.) |
| `DetailsDrawer` | `components/audit-logs/` | Slide-out panel showing full log entry `details` as formatted JSON |
| `ExportButton` | `components/audit-logs/` | Triggers export; shows loading state; opens download URL |

### 6.3 Per-Component TypeScript Interfaces

```typescript
interface AuditLogEntry {
  id: string;
  action: string;
  actor: {
    user_id: string | null;
    email: string;
    display_name: string | null;
  };
  actor_ip: string | null;
  resource_type: string | null;
  resource_id: string | null;
  resource_name: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

interface AuditLogFilters {
  since: string;      // ISO8601
  until: string;      // ISO8601
  action: string | null;
  actor_user_id: string | null;
  resource_type: string | null;
}

interface AuditLogFilterBarProps {
  filters: AuditLogFilters;
  onFiltersChange: (filters: AuditLogFilters) => void;
  availableActions: string[];
}

interface AuditLogTableProps {
  entries: AuditLogEntry[];
  loading: boolean;
  onRowClick: (entry: AuditLogEntry) => void;
  onLoadMore: () => void;
  hasMore: boolean;
}

interface AuditLogRowProps {
  entry: AuditLogEntry;
  onClick: () => void;
}

interface DetailsDrawerProps {
  entry: AuditLogEntry | null;
  onClose: () => void;
}
```

### 6.4 API Calls Table

| Action | Method | URL | When Triggered |
|---|---|---|---|
| Load action types | GET | `/audit-logs/actions` | AuditLogPage mount (once) |
| Load logs | GET | `/audit-logs?since=...&until=...&limit=50` | AuditLogPage mount + filter change |
| Load more | GET | `/audit-logs?cursor=...` | "Load more" button click |
| Get detail | GET | `/audit-logs/{id}` | AuditLogRow click (open DetailsDrawer) |
| Export | GET | `/audit-logs/export?since=...&until=...` | ExportButton click |

### 6.5 State Shape (Zustand)

```typescript
interface AuditLogStore {
  entries: AuditLogEntry[];
  nextCursor: string | null;
  total: number;
  loading: boolean;
  loadingMore: boolean;
  filters: AuditLogFilters;
  availableActions: string[];
  selectedEntry: AuditLogEntry | null;
  exportLoading: boolean;

  setFilters: (filters: AuditLogFilters) => void;
  fetchLogs: () => Promise<void>;
  fetchMoreLogs: () => Promise<void>;
  selectEntry: (entry: AuditLogEntry | null) => void;
  exportLogs: () => Promise<string>; // returns download URL
}
```

### 6.6 UX Behavior

- Filter changes reset cursor and reload from page 1.
- Default date range: last 7 days (matches Postman export default).
- Action badge color by category prefix: `user.*` = blue, `team.*` = green, `workspace.*` = purple, `collection.*` = orange, `environment.*` = teal, `governance.*` = red, `api.*`/`spec.*` = yellow.
- Details JSON shown in DetailsDrawer with syntax highlight (same Monaco viewer used elsewhere, read-only mode).
- Export button disabled while `exportLoading = true`; shows spinner + "Preparing export…" text.

---

## 7. Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Pagination style | Cursor-based (`created_at + id`) | Logs append-only; offset pagination gives inconsistent results as new events arrive |
| 2 | Export delivery | Presigned URL (1 hour TTL) | Avoids streaming large CSVs through API server |
| 3 | Export max rows | 50,000 | Prevents runaway server-side CSV gen; user must narrow date range for larger exports |
| 4 | Retention | 180 days | Matches Postman Enterprise; covers most compliance windows |
| 5 | `log_audit_event` non-blocking | Background task | Audit log write must never fail the primary request |
| 6 | `actor_email` denormalized | Yes | Preserved when user is deleted; log integrity maintained |
| 7 | `resource_name` denormalized | Yes | Preserved when resource is deleted/renamed |
| 8 | Table virtualization | `@tanstack/react-virtual` | Audit tables can have thousands of rows per page-load |
| 9 | SIEM integration | Deferred | No webhook infra yet; CSV export covers compliance use case |
| 10 | Email export delivery | Deferred | No email infra; return presigned URL directly instead |

---

## 8. Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | Actor user deleted — FK breaks | `actor_email` + `actor_user_id` denormalized; FK is nullable, set null on user delete |
| 2 | Resource deleted — FK breaks | `resource_id` nullable FK; resource_name denormalized for display |
| 3 | Audit write failure must not fail primary request | `log_audit_event` runs as Celery background task; exceptions swallowed + logged to app logger |
| 4 | `COUNT(*)` on large table is slow | Use approximate count (`reltuples` from `pg_class`) for display; exact count only up to 10,000 |
| 5 | Export filter returns >50,000 rows | 400 before task creation; message: "Narrow date range (max 50,000 rows per export)" |
| 6 | Concurrent filter changes while loading | Cancel in-flight request via AbortController on each new filter change |
| 7 | `X-Forwarded-For` spoofing | Trust only first IP in `X-Forwarded-For` chain; document that this is behind a trusted reverse proxy |
| 8 | `since` > `until` | 400 validation error |
| 9 | `limit` > 200 | Clamp to 200; do not 400 |
| 10 | System events (no actor) | `actor_user_id = null`, `actor_email = "system@apipilot"` convention |

---

## 9. Deferred Items

| Item | Reason |
|---|---|
| Email delivery for CSV export | No email infra |
| SIEM webhook push | No webhook infra |
| Real-time audit log streaming (WebSocket) | Polling on filter change is sufficient |
| Workspace-level audit vs team-level split UI | Single unified view adequate for v1 |
| Audit log search (full-text on `details`) | JSONB full-text search deferred; filter by action + actor covers 90% of use cases |
