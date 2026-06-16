# Audit Logs

Status: Partial
Coverage: 60%

## Implemented (backend)
- `AuditLog` model
- `write_audit(db, ...)` helper in `common_querys.py` — called in same transaction as mutation
- Audit written on: node.create, node.delete, api_case.create, api_case.update, api_case.delete, node.version.restore, flow.run
- `GET /audit?workspace_id=&limit=&offset=` — admin-only, paginated (max 200/page)

## Missing
- FE AuditLogTable (admin viewer)
- God user action audit (T3.2 deferred)

## Current Task
None (backend done)

## Next Task
FE AuditLogTable

## Dependencies
- 14-workspaces (admin role gate)

## Priority
P2
