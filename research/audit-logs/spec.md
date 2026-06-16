# Spec — Audit Logs

STATUS: in-progress (backend done; FE missing)
LAST_CHANGED: 2026-06-16
SOURCE: phases/phase_2_audit_rbac/spec.md

## Goal
Append-only audit trail of who did what in a workspace. Admin-only read. Closes security gap S7.

## Backend (shipped)

### Endpoint
```
GET /audit?workspace_id=&limit=&offset=
  Auth: admin role
  Response: paginated list of AuditLog rows
  Max page: 200
```

## Frontend (missing)
AuditLogTable — paginated table, mirrors HistoryPanel pattern.

## Decision Table
| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Audit write timing | Same transaction as mutation | Atomic; no orphan audit |
| 2 | Immutability | No update/delete on audit | Tamper-evidence |
| 3 | PII | Store username + action, minimal metadata | Privacy |
| 4 | Growth | Monthly partition + 90d retention (future) | D4 unbounded-growth fix |

## Edge Cases
| # | Trap | Fix |
|---|---|---|
| 1 | Audit insert fails | Mutation rolls back too (acceptable — atomicity) |
| 2 | High write volume | Async-safe insert; batch if needed |
| 3 | Missing workspace_id (account ops) | nullable workspace_id |
