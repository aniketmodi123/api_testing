# Spec — Workspaces

STATUS: Complete — backend + frontend working
LAST_CHANGED: 2026-06-18
SOURCE: phases/stable + live research 2026-06-16

STABLE_COMMIT: 3b96d46  ("workspace work is complete")
→ Use `git checkout 3b96d46` to recover last known-good workspace state

---

## 1. Goal

Provide isolated collaboration spaces where teams can organize collections, environments, APIs, mocks, and monitors. Workspaces define the visibility boundary and RBAC scope for all resources.

**APIPilot differentiator:** Unlimited collaborators, no per-seat tax (Postman charges $14/seat/month on Team plan).

---

## 2. Postman Feature Parity

| Postman Feature | APIPilot Scope |
|---|---|
| Personal workspace (private to owner) | Yes |
| Team workspace (visible to all team members) | Yes |
| Private workspace (invite-only, enterprise) | Yes — all workspaces are effectively private (invite-only) |
| Public workspace (discoverable by anyone) | Deferred (no public API network) |
| Partner workspace (external collaborators) | Deferred |
| Workspace CRUD (create, rename, delete, change visibility) | Yes |
| Workspace member management (invite, remove, change role) | Yes |
| Workspace-level roles: Admin, Editor, Viewer | Yes |
| Element-level roles (collection/env/mock/monitor) | Yes — `editor`/`viewer` per element |
| Move elements between workspaces | Yes |
| Workspace overview page | Yes |
| Team discovery of workspaces | Yes — list all team workspaces |
| SSO / SCIM provisioning | Deferred |
| Community Manager role | Deferred (no public workspaces) |
| Workspace activity feed | Yes — via audit logs |

---

## 3. Workspace Types (APIPilot Simplified Model)

| Type | Visibility | Who Can See |
|---|---|---|
| `personal` | Owner only | Created automatically on user signup; cannot be shared |
| `private` | Invited members only | Default for new team workspaces |
| `team` | All team members | Explicit team-wide access |

No public workspaces in v1.

---

## 4. Data Models

### 4.1 Workspace (existing — verify columns)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| team_id | UUID | FK → Team, nullable | NULL for personal workspaces |
| name | VARCHAR(255) | NOT NULL | |
| description | TEXT | nullable | |
| type | VARCHAR(20) | NOT NULL | `personal`, `private`, `team` |
| created_by | UUID | FK → User | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

Unique: `(team_id, name)` — no duplicate workspace names per team.

### 4.2 WorkspaceMember (existing — verify + extend)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| workspace_id | UUID | FK → Workspace | |
| user_id | UUID | FK → User | |
| role | VARCHAR(20) | NOT NULL | `admin`, `editor`, `viewer` |
| invited_by | UUID | FK → User, nullable | |
| joined_at | TIMESTAMPTZ | nullable | NULL until invite accepted |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

Unique: `(workspace_id, user_id)`.

### 4.3 WorkspaceInvite (new — if not already existing)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| workspace_id | UUID | FK → Workspace | |
| email | VARCHAR(255) | NOT NULL | Invitee email |
| role | VARCHAR(20) | NOT NULL | `admin`, `editor`, `viewer` |
| token | VARCHAR(100) | NOT NULL, UNIQUE | Random URL-safe token |
| invited_by | UUID | FK → User | |
| expires_at | TIMESTAMPTZ | NOT NULL | 7 days from creation |
| accepted_at | TIMESTAMPTZ | nullable | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

---

## 5. RBAC Model

### 5.1 Workspace-Level Roles

| Action | admin | editor | viewer |
|---|:---:|:---:|:---:|
| View workspace + resources | ✔ | ✔ | ✔ |
| Send requests | ✔ | ✔ | ✔ |
| Fork/export resources | ✔ | ✔ | ✔ |
| Create collections/environments/mocks/monitors | ✔ | ✔ | — |
| Edit/delete resources | ✔ | ✔ | — |
| Move resources to/from workspace | ✔ | ✔ | — |
| Rename workspace / edit description | ✔ | — | — |
| Change workspace type/visibility | ✔ | — | — |
| Invite members | ✔ | — | — |
| Remove members | ✔ | — | — |
| Change member roles | ✔ | — | — |
| Delete workspace | ✔ | — | — |

### 5.2 Element-Level Roles (per collection / environment / mock / monitor)

When a resource has explicit element-level roles set, those override the workspace role for that resource:

| Action | editor | viewer |
|---|:---:|:---:|
| View / use | ✔ | ✔ |
| Edit / delete | ✔ | — |
| Manage element roles | ✔ | — |
| Fork / export | ✔ | ✔ |

Element-level roles are **additive upward** — a workspace `viewer` with `editor` on a collection can edit that collection.

### 5.3 Team-Level Roles (for APIPilot)

| Role | Capabilities |
|---|---|
| `owner` | All admin rights; manages billing, team settings; cannot be removed |
| `admin` | Manages team members, workspace creation, roles; no billing |
| `member` | Default; accesses workspaces they're invited to |

Team roles control what workspaces a user can see and create. Workspace roles control what they can do inside a workspace.

---

## 6. Backend Specification

### 6.1 Endpoints

#### Workspace CRUD (verify existing)

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST | `/workspaces` | team member | Create workspace |
| GET | `/workspaces` | team member | List workspaces user has access to |
| GET | `/workspaces/{id}` | workspace viewer | Get workspace details + stats |
| PATCH | `/workspaces/{id}` | workspace admin | Update name/description/type |
| DELETE | `/workspaces/{id}` | workspace admin | Delete workspace (must be empty or force-delete) |

#### Member Management (verify existing)

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| GET | `/workspaces/{id}/members` | viewer | List members + roles |
| POST | `/workspaces/{id}/members` | admin | Invite member (by email or user_id) |
| PATCH | `/workspaces/{id}/members/{user_id}` | admin | Change member role |
| DELETE | `/workspaces/{id}/members/{user_id}` | admin | Remove member |

#### Invites (new if not existing)

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| GET | `/workspaces/{id}/invites` | admin | List pending invites |
| DELETE | `/workspaces/{id}/invites/{invite_id}` | admin | Cancel invite |
| POST | `/invites/{token}/accept` | — (token-based) | Accept invite |

#### Element Move (new)

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST | `/workspaces/{id}/move` | editor (both workspaces) | Move element to this workspace |

Request body: `{element_type: "collection"|"environment"|"mock"|"monitor", element_id: "uuid"}`.

### 6.2 Workspace Overview Response

`GET /workspaces/{id}` returns:
```json
{
  "id": "uuid",
  "name": "My Workspace",
  "description": "...",
  "type": "private",
  "created_by": {"user_id": "uuid", "display_name": "Alice"},
  "member_count": 5,
  "stats": {
    "collections": 12,
    "environments": 4,
    "mocks": 2,
    "monitors": 3,
    "apis": 6
  },
  "your_role": "editor",
  "created_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-06-16T10:00:00Z"
}
```

### 6.3 Invite Flow

1. `POST /workspaces/{id}/members` with `{email, role}`.
2. If user with that email exists in team → add directly as WorkspaceMember.
3. If not → create WorkspaceInvite with token; send invite email (or return invite link).
4. Invitee hits `POST /invites/{token}/accept` → creates WorkspaceMember + sets `joined_at`.
5. Invite expires after 7 days.

### 6.4 Workspace Deletion Rules

- Cannot delete `personal` workspace (owned by user lifecycle).
- Must have zero members except owner OR use `?force=true` query param (admin-level check).
- Resources (collections, environments, etc.) deleted CASCADE or moved first — client responsibility to move them first; if `force=true`, resources are deleted too.
- Soft-delete pattern: mark `deleted_at` (do not hard delete) for 30-day recovery window.

### 6.5 Type = `team` Behavior

When `type = team`, all team members automatically have `viewer` role (virtual membership — no WorkspaceMember row needed). Admins can elevate specific users to `editor` or `admin`.

### 6.6 Modified Files

| File | Change |
|---|---|
| `models/workspace.py` | Verify all columns present; add WorkspaceInvite model |
| `routers/workspaces.py` | Add invite CRUD, element-move endpoint |
| `services/workspace_service.py` | Invite flow, team-type membership logic, deletion rules |
| `alembic/versions/xxx_workspace.py` | Migration: WorkspaceInvite table; soft-delete column |

---

## 7. Frontend Specification

### 7.1 Library Decisions

| Decision | Choice | Reason |
|---|---|---|
| Role badge | Custom inline component | 3 roles only; no library needed |
| Member table | Custom table | Simple enough |
| Invite modal | Custom modal | Standard pattern already in project |

### 7.2 Component Inventory

| Component | Location | Purpose |
|---|---|---|
| `WorkspaceSwitcher` | `components/workspace/` | Dropdown in header: switch active workspace |
| `WorkspaceCreateModal` | `components/workspace/` | Create new workspace: name + type |
| `WorkspaceSettingsPage` | `pages/workspace/settings/` | Name, description, type, danger zone (delete) |
| `WorkspaceMemberList` | `components/workspace/` | Table: member, email, role badge, actions |
| `InviteMemberModal` | `components/workspace/` | Email input + role select + send invite |
| `PendingInvitesList` | `components/workspace/` | List pending invites with cancel option |
| `WorkspaceOverviewPage` | `pages/workspace/` | Stats cards + recent activity |
| `WorkspaceStatsCard` | `components/workspace/` | Count card: collections / envs / mocks / monitors |
| `MoveToWorkspaceModal` | `components/workspace/` | Dropdown: pick target workspace, confirm move |

### 7.3 Per-Component TypeScript Interfaces

```typescript
interface Workspace {
  id: string;
  name: string;
  description: string | null;
  type: 'personal' | 'private' | 'team';
  member_count: number;
  your_role: 'admin' | 'editor' | 'viewer';
  created_at: string;
  updated_at: string;
}

interface WorkspaceDetail extends Workspace {
  stats: {
    collections: number;
    environments: number;
    mocks: number;
    monitors: number;
    apis: number;
  };
  created_by: { user_id: string; display_name: string };
}

interface WorkspaceMember {
  user_id: string;
  email: string;
  display_name: string;
  role: 'admin' | 'editor' | 'viewer';
  joined_at: string | null;
}

interface WorkspaceInvite {
  id: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  invited_by: string;
  expires_at: string;
}

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  onSwitch: (workspaceId: string) => void;
}

interface InviteMemberModalProps {
  workspaceId: string;
  onInvited: () => void;
}

interface MoveToWorkspaceModalProps {
  elementType: 'collection' | 'environment' | 'mock' | 'monitor';
  elementId: string;
  currentWorkspaceId: string;
  onMoved: () => void;
}
```

### 7.4 API Calls Table

| Action | Method | URL | When Triggered |
|---|---|---|---|
| List workspaces | GET | `/workspaces` | WorkspaceSwitcher open; app init |
| Load workspace detail | GET | `/workspaces/{id}` | WorkspaceOverviewPage mount |
| Create workspace | POST | `/workspaces` | WorkspaceCreateModal confirm |
| Update workspace | PATCH | `/workspaces/{id}` | WorkspaceSettingsPage save |
| Delete workspace | DELETE | `/workspaces/{id}` | Danger zone confirm |
| List members | GET | `/workspaces/{id}/members` | WorkspaceMemberList mount |
| Invite member | POST | `/workspaces/{id}/members` | InviteMemberModal confirm |
| Change member role | PATCH | `/workspaces/{id}/members/{uid}` | Role dropdown change |
| Remove member | DELETE | `/workspaces/{id}/members/{uid}` | Remove button confirm |
| List invites | GET | `/workspaces/{id}/invites` | PendingInvitesList mount |
| Cancel invite | DELETE | `/workspaces/{id}/invites/{id}` | Cancel invite button |
| Accept invite | POST | `/invites/{token}/accept` | Invite link landing page |
| Move element | POST | `/workspaces/{id}/move` | MoveToWorkspaceModal confirm |

### 7.5 State Shape (Zustand)

```typescript
interface WorkspaceStore {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceDetail | null;
  members: WorkspaceMember[];
  pendingInvites: WorkspaceInvite[];
  loading: boolean;

  setActiveWorkspace: (id: string) => void;
  fetchWorkspaces: () => Promise<void>;
  fetchWorkspaceDetail: (id: string) => Promise<void>;
  fetchMembers: (workspaceId: string) => Promise<void>;
  inviteMember: (workspaceId: string, email: string, role: string) => Promise<void>;
  removeMember: (workspaceId: string, userId: string) => Promise<void>;
  updateMemberRole: (workspaceId: string, userId: string, role: string) => Promise<void>;
}
```

### 7.6 UX Behavior

- **Active workspace** persists in `localStorage`. Restored on page reload.
- **WorkspaceSwitcher** in header shows workspace name + type badge (lock icon for private, team icon for team).
- **Personal workspace** cannot be deleted or have members added — member management UI hidden.
- **Invite link**: if no email server configured, show invite link in modal for manual sharing.
- **Type = team** workspaces show "All team members have Viewer access" notice in member list.

---

## 8. Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Public workspaces | Deferred | No public API network in v1; adds discovery complexity |
| 2 | Partner workspaces | Deferred | Enterprise-only; no need for v1 |
| 3 | Workspace type model | 3 types (personal/private/team) | Covers all APIPilot use cases without Postman's full complexity |
| 4 | Team-type auto-membership | Virtual (no DB row per member) | Avoids N rows per team-type workspace; membership implied by team membership |
| 5 | Workspace deletion | Soft-delete + 30-day recovery | Prevents accidental permanent data loss |
| 6 | Invite flow | Token in URL (no email required) | Email infra not yet set up; invite link works as fallback |
| 7 | Duplicate workspace names | Not allowed within team | Prevents user confusion |
| 8 | Per-collection sub-tree sharing | Deferred | Complex; workspace-level sharing covers 90% of cases |

---

## 9. Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | Last admin leaves workspace | Block: 403 "Cannot remove the last admin" |
| 2 | User removed from team | CASCADE: remove all WorkspaceMember rows for that user |
| 3 | Move element to workspace where user has no editor role | 403 at target workspace check |
| 4 | Accept expired invite token | 410 Gone: "Invite has expired" |
| 5 | Accept already-accepted invite | 409: "Invite already accepted" |
| 6 | `type = team` workspace — user invited with explicit `viewer` role | Explicit row takes precedence over virtual membership |
| 7 | Delete workspace with resources and no `force=true` | 409: "Workspace has resources. Move them first or use force=true" |
| 8 | Workspace name collision on rename | 409 with existing workspace name |

---

## 10. Deferred Items

| Item | Reason |
|---|---|
| Public workspaces + API network discovery | No public marketplace in v1 |
| Partner workspaces (external users) | Enterprise feature; no external user model yet |
| Per-collection sub-tree sharing (`node_id` on WorkspaceMember) | Complex access control; deferred per original spec |
| SSO / SCIM provisioning | No SSO infra |
| Community Manager role | Only needed for public workspaces |
| Workspace activity feed (separate from audit logs) | Audit logs cover this use case |
