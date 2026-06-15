# Spec — Audit + RBAC Extension

STATUS: not-started
LAST_CHANGED: 2026-06-15

## Goal
Add an append-only audit log + a reusable role gate applied to all new endpoints.

## Deliverables
1. `audit_logs` table (username, workspace_id, action, entity_type, entity_id, metadata, ip, created_at).
2. `write_audit(db, ...)` helper called inside mutating handlers (same txn).
3. `require_role(min_role)` FastAPI dependency wrapping `can_access_workspace`.
4. `GET /audit?workspace_id=&limit=&offset=` admin-only.

## Backend Changes
### New Models
| Model | Fields | Notes |
|---|---|---|
| AuditLog | id, username(idx), workspace_id(idx,nullable), action, entity_type, entity_id, metadata(JSON), ip, created_at(idx) | append-only; partition by month |

### New Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | /audit | admin reads workspace audit (paginated) |

### Modified Endpoints / Logic
| File | Change |
|---|---|
| (new) common_querys.py `write_audit` | insert audit row |
| (new) security/deps.py `require_role` | `Depends` gate using can_access_workspace |
| node/api_cases/workspace mutating routers | call write_audit on create/update/delete |
| main.py | register audit router; add AuditLog import |

## Frontend Changes
| Component | Location | Purpose |
| AuditLogTable | components/Admin | admin-only audit viewer (light, can defer to phase_11 UI) |

## Decision Table
| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Audit write timing | same transaction as mutation | atomic; no orphan/missing audit |
| 2 | Gate form | `require_role` dependency | DRY across new routers, matches Depends pattern |
| 3 | Immutability | no update/delete endpoints on audit | tamper-evidence |
| 4 | PII | store username + action, minimal metadata | privacy |
| 5 | Growth | monthly partition + 90d retention | D4 unbounded-growth fix |

## Edge Cases
| # | Trap | How it breaks | Fix |
|---|---|---|---|
| 1 | Audit insert fails | mutation rolls back too | acceptable — atomicity; log error |
| 2 | god user actions | bypass role but still must audit | audit god actions explicitly |
| 3 | High write volume | audit slows hot path | async-safe insert, batch if needed |
| 4 | Missing workspace_id (account ops) | null FK | nullable workspace_id |

## Open Questions
| # | Question | Recommendation |
|---|---|---|
| 1 | Audit UI now or phase_11 | minimal table now, rich view in collaboration phase |
