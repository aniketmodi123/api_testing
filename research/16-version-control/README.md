# 16 — Version Control (Node Snapshots)

Status: Partial
Coverage: 40%

## Implemented (backend)
- `NodeVersion` model (snapshot JSON blob)
- Snapshot endpoint: `POST /node/{id}/version` — capture full subtree
- List versions: `GET /node/{id}/versions`
- Get snapshot: `GET /node/version/{version_id}`
- Restore: `POST /node/version/{version_id}/restore` — additive restore (does not delete extras)

## Missing
- FE VersionHistoryPanel (diff view + restore button)

## Current Task
None (backend done)

## Next Task
FE VersionHistoryPanel

## Dependencies
- audit-logs (restore action audited — done)
- 07-collections (node model)

## Priority
P2
