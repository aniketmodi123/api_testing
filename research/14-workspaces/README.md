# 14 — Workspaces

Status: Existing
Coverage: 90%

## Implemented
- `Workspace` model
- Create / rename / delete workspace
- `WorkspaceMember` — viewer/editor/admin/owner roles
- `WorkspaceInvite` — email token, 7-day expiry
- `can_access_workspace(db, ws_id, user_id, min_role)` RBAC gate

## Missing
- Per-collection sharing granularity (currently workspace-level only)

## Current Task
None

## Next Task
Per-collection sharing (extend WorkspaceMember with optional node_id scope)

## Dependencies
None

## Priority
P0 (existing, stable)
