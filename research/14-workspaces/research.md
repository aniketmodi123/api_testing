# Research — Workspaces

LAST_UPDATED: 2026-06-16

## Existing Code
| File | Purpose |
|---|---|
| `backend/src/models.py` | `Workspace`, `WorkspaceMember`, `WorkspaceInvite` |
| `backend/src/routers/workspace/` | CRUD + members + invites |
| `backend/src/common_querys.py` | `can_access_workspace(db, ws_id, user_id, min_role)` |

## Role Hierarchy
`viewer < editor < admin < owner` — numeric rank in `can_access_workspace`

## WorkspaceMember Model
```
WorkspaceMember
  id
  workspace_id    FK → workspaces CASCADE
  user_id         FK → users
  role            varchar(20)  "viewer"|"editor"|"admin"|"owner"
  joined_at       datetime
```

## WorkspaceInvite Model
```
WorkspaceInvite
  id
  workspace_id    FK → workspaces CASCADE
  email           varchar(255)
  token           varchar(64) unique
  role            varchar(20)
  expires_at      datetime  (7 days from creation)
  accepted        bool default False
```
