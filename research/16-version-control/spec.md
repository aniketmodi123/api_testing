# Spec — Version Control (Node Snapshots)

STATUS: in-progress (backend done; FE missing)
LAST_CHANGED: 2026-06-16
SOURCE: phases/phase_11_collaboration/spec.md

## Goal
Point-in-time snapshots of a collection subtree — save, list, diff, restore.

## Backend (shipped)
See research.md for models + endpoints.

## Endpoints
| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST | `/node/{node_id}/version` | editor | Snapshot current subtree |
| GET | `/node/{node_id}/versions` | viewer | List snapshots |
| GET | `/node/version/{version_id}` | viewer | Full snapshot JSON |
| POST | `/node/version/{version_id}/restore` | editor | Restore (additive) |

## Frontend (missing)
| Component | Purpose |
|---|---|
| VersionHistoryPanel | List snapshots; show diff vs current; restore button |

## Decision Table
| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Additive restore only | Does not delete extras | Destructive restore risks data loss; user deletes manually |
| 2 | Snapshot stores JSON blob | Not FK chain | Avoids versioning complexity; acceptable at MVP |
| 3 | No snapshot limit at MVP | Unbounded | Add retention policy if storage grows |
