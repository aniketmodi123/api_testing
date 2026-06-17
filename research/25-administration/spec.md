# Spec — Administration

STATUS: updated
LAST_CHANGED: 2026-06-16

---

## Overview

APIPilot has workspace-scoped roles (`viewer | editor | admin`) and a `/meta/comparison`
public endpoint. No system-level admin panel exists.

Postman's admin features split into two tiers:
- **Workspace admin** — manage members, roles, invites within a workspace (partially built)
- **Organization/system admin** — user deactivation, SSO, SCIM, billing, audit logs, usage
  metrics, system health (mostly missing)

APIPilot is self-hosted + single-org, so Enterprise features (SSO/SCIM/BYOK) are P3.
Focus: workspace admin UI + system health dashboard for self-hosted operators.

---

## Postman Feature Map vs APIPilot

| Feature | Postman | APIPilot | Gap |
|---|---|---|---|
| Workspace member list | ✅ | ✅ BE (members.py) | FE missing |
| Invite member (email + role) | ✅ | ✅ BE (WorkspaceInvite) | FE missing |
| Remove member | ✅ | partial | FE missing |
| Change member role | ✅ | partial | FE missing |
| Workspace-level roles (viewer/editor/admin) | ✅ | ✅ | — |
| Super-admin role (cross-workspace) | ✅ | ❌ | P2 |
| Deactivate user account | ✅ | ❌ | P2 |
| System health dashboard | N/A (cloud) | ❌ needed for self-hosted | P2 |
| Usage metrics (API calls, test runs) | ✅ | ❌ | P2 |
| SSO (SAML 2.0) | ✅ Enterprise | ❌ | P3 |
| SCIM provisioning | ✅ Enterprise | ❌ | P3 |
| Billing management | ✅ | N/A (self-hosted) | defer |
| Audit logs UI | ✅ | ❌ (BE done, FE missing) | P1 (see audit-logs/spec.md) |
| Comparison / pricing table | ✅ | ✅ `/meta/comparison` | — |

---

## Backend

### Existing Routes (shipped)

| Method | Path | Purpose |
|---|---|---|
| GET | `/meta/comparison` | Public feature comparison table (no auth) |
| GET | `/workspaces` | List user's workspaces |
| POST | `/workspaces` | Create workspace |
| GET | `/workspaces/{id}/members` | List workspace members |
| POST | `/workspaces/{id}/invite` | Invite member by email + role |
| DELETE | `/workspaces/{id}/members/{user_id}` | Remove member |
| PATCH | `/workspaces/{id}/members/{user_id}/role` | Change member role |

### Missing Backend Endpoints

#### Super-admin (system-level)

A `is_superadmin` flag on `User` model enables cross-workspace visibility.

```
User.is_superadmin    BOOLEAN NOT NULL DEFAULT false
```

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| GET | `/admin/users` | superadmin | List all users (paginated) |
| PATCH | `/admin/users/{user_id}/deactivate` | superadmin | Deactivate user account |
| PATCH | `/admin/users/{user_id}/reactivate` | superadmin | Reactivate user |
| GET | `/admin/stats` | superadmin | System usage metrics |
| GET | `/admin/health` | superadmin | System health (DB, cache, scheduler) |

#### `GET /admin/stats` response shape

```json
{
  "total_users": 142,
  "active_users_30d": 89,
  "total_workspaces": 67,
  "total_requests": 14820,
  "total_test_cases": 3201,
  "total_schedule_runs": 412,
  "total_schedule_runs_30d": 88
}
```

#### `GET /admin/health` response shape

```json
{
  "db": "ok",
  "scheduler": "ok",
  "smtp_configured": true,
  "env_vars": {
    "SECRET_ENC_KEY": "set",
    "SMTP_SERVER": "set",
    "SMTP_USERNAME": "set"
  }
}
```

### `User` Model — Missing Fields

```
is_superadmin   BOOLEAN NOT NULL DEFAULT false
is_active       BOOLEAN NOT NULL DEFAULT true
deactivated_at  TIMESTAMPTZ nullable
```

`is_active=false` → reject login with 403 "Account deactivated". Check in auth middleware.

---

## Frontend

### Component Inventory

| Component | Location | Purpose |
|---|---|---|
| `WorkspaceSettingsPage` | `src/pages/WorkspaceSettingsPage.tsx` | Workspace admin: members, invites, danger zone |
| `MembersTable` | `src/components/admin/MembersTable.tsx` | List workspace members with role selector + remove |
| `InviteMemberForm` | `src/components/admin/InviteMemberForm.tsx` | Email + role select + Send Invite button |
| `PendingInvitesList` | `src/components/admin/PendingInvitesList.tsx` | List pending invites with resend/cancel actions |
| `RoleSelector` | `src/components/admin/RoleSelector.tsx` | Inline dropdown: viewer / editor / admin |
| `DangerZoneSection` | `src/components/admin/DangerZoneSection.tsx` | Delete workspace (confirm by typing name) |
| `SystemAdminPage` | `src/pages/SystemAdminPage.tsx` | Superadmin: user list, health, stats |
| `UserListTable` | `src/components/admin/UserListTable.tsx` | All users: email, workspaces count, active toggle |
| `SystemHealthCard` | `src/components/admin/SystemHealthCard.tsx` | DB/scheduler/SMTP status indicators |
| `UsageStatsPanel` | `src/components/admin/UsageStatsPanel.tsx` | Counts: users, workspaces, runs, test cases |

### TypeScript Interfaces

```typescript
interface WorkspaceMember {
  user_id: number;
  username: string;
  email: string;
  role: 'viewer' | 'editor' | 'admin';
  joined_at: string;
}

interface PendingInvite {
  id: number;
  email: string;
  role: 'viewer' | 'editor' | 'admin';
  created_at: string;
  expires_at: string;
}

interface AdminUser {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  is_superadmin: boolean;
  workspace_count: number;
  created_at: string;
  deactivated_at: string | null;
}

interface SystemStats {
  total_users: number;
  active_users_30d: number;
  total_workspaces: number;
  total_requests: number;
  total_test_cases: number;
  total_schedule_runs: number;
  total_schedule_runs_30d: number;
}

interface SystemHealth {
  db: 'ok' | 'error';
  scheduler: 'ok' | 'error' | 'unknown';
  smtp_configured: boolean;
  env_vars: Record<string, 'set' | 'missing'>;
}
```

### Component Render Descriptions

**`WorkspaceSettingsPage`**: Three tabs: Members | Invites | Danger Zone. Accessible to workspace `admin` role only. Gate: redirect non-admins to workspace home.

**`MembersTable`**: Table rows: avatar initial + username + email + `RoleSelector` (inline, saves on change) + Remove button. Owner row: no Remove, no role change. Self row: no role change.

**`InviteMemberForm`**: Email input + `RoleSelector` + "Send Invite" button. Validates email format. Shows success toast + adds to pending list. Shows error if already a member or already invited.

**`PendingInvitesList`**: List of pending invites with email, role badge, "expires in X days" chip, Resend button, Cancel button.

**`RoleSelector`**: Small dropdown: Viewer / Editor / Admin. Saves via PATCH immediately on change (no separate Save button). Shows spinner during save. Shows error toast on failure.

**`DangerZoneSection`**: Red-bordered section. "Delete Workspace" button → modal: type workspace name to confirm → DELETE. Warns: "All files, requests, and test cases will be permanently deleted."

**`SystemAdminPage`**: Accessible to `is_superadmin=true` users only. Two-column: left = `UsageStatsPanel` + `SystemHealthCard`. Right = `UserListTable`. Route guarded at FE + BE.

**`UserListTable`**: Paginated (20/page). Columns: username, email, workspaces, joined, status toggle (Active/Deactivated). Toggle calls PATCH `/admin/users/{id}/deactivate` or `/reactivate`. Search by email/username.

**`SystemHealthCard`**: Status dots: green = ok, red = error. Shows DB, Scheduler, SMTP, required env vars. "Refresh" button re-fetches.

**`UsageStatsPanel`**: Six stat cards: Total Users, Active (30d), Workspaces, Requests, Test Cases, Schedule Runs (30d).

### API Calls

| Action | Method | URL | When |
|---|---|---|---|
| List members | GET | `/workspaces/{id}/members` | Members tab opens |
| Invite member | POST | `/workspaces/{id}/invite` | Invite form submit |
| List invites | GET | `/workspaces/{id}/invites` | Invites tab opens |
| Resend invite | POST | `/workspaces/{id}/invites/{inv_id}/resend` | Resend button |
| Cancel invite | DELETE | `/workspaces/{id}/invites/{inv_id}` | Cancel button |
| Change role | PATCH | `/workspaces/{id}/members/{uid}/role` | RoleSelector change |
| Remove member | DELETE | `/workspaces/{id}/members/{uid}` | Remove button confirm |
| Delete workspace | DELETE | `/workspaces/{id}` | Danger zone confirm |
| List all users | GET | `/admin/users?page=&search=` | SystemAdminPage load |
| Deactivate user | PATCH | `/admin/users/{id}/deactivate` | Toggle off |
| Reactivate user | PATCH | `/admin/users/{id}/reactivate` | Toggle on |
| System stats | GET | `/admin/stats` | SystemAdminPage load |
| System health | GET | `/admin/health` | SystemAdminPage load |

---

## Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Super-admin model | `is_superadmin` flag on User | Simplest; no separate role table; self-hosted = 1 admin |
| 2 | Deactivation | Soft delete (`is_active=false`) | Preserve data; re-activation possible |
| 3 | Auth check on deactivated | Reject at login (403) | Fastest gate; no session invalidation complexity |
| 4 | SSO/SCIM | Deferred (P3) | Self-hosted single-org; LDAP/SSO demand not yet validated |
| 5 | Billing | N/A for self-hosted | Self-hosted license model; no Stripe integration |
| 6 | `/meta/comparison` | Keep public (no auth) | Landing page marketing; must load before login |

---

## Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | Last admin removed from workspace | Block remove: "Cannot remove the last admin" |
| 2 | Superadmin deactivates themselves | Block: "Cannot deactivate your own account" |
| 3 | Viewer accesses workspace settings | Redirect to home; settings tab not shown in nav |
| 4 | Invite to already-member email | Return 409 "Already a member"; show inline error |
| 5 | Deactivated user's sessions | No session table — JWT expiry naturally gates; on reactivation user must re-login |
| 6 | SystemAdminPage accessed by non-superadmin | Return 403 from all `/admin/*` routes; FE hides the nav link but BE enforces |

---

## Deferred

| Item | Reason |
|---|---|
| SSO (SAML 2.0) | `routers/sso/` stub exists; Enterprise feature; P3 |
| SCIM provisioning | Enterprise; no demand yet |
| BYOK encryption | Enterprise; KMS interface stub exists |
| Billing / plan management | N/A for self-hosted |
| Domain capture | Multi-org concept; not applicable to self-hosted |
| Service accounts | P3; API key management covers most use cases |
