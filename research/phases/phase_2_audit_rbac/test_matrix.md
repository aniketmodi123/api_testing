# Test Matrix — Audit + RBAC Extension

LAST_UPDATED: 2026-06-15

## Happy Path
| ID | Scenario | Input | Expected |
|---|---|---|---|
| H1 | Editor creates node | authed editor | node created + audit row(action=node.create) |
| H2 | Admin reads audit | GET /audit | paginated rows for workspace |
| H3 | require_role passes | editor on write | proceeds |

## Edge Cases
| ID | Trap # | Scenario | Expected |
|---|---|---|---|
| E1 | 2 | god performs delete | audit row written for god action |
| E2 | 4 | account-level action | audit row workspace_id null |
| E3 | 1 | audit insert fails mid-txn | whole mutation rolls back |

## Error Cases
| ID | Scenario | Expected |
|---|---|---|
| X1 | viewer hits write endpoint | 403, no mutation, no audit |
| X2 | non-member reads /audit | 403 |
| X3 | attempt to edit/delete an audit row | no such endpoint (immutable) |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | member invite/join/role | unchanged + now audited |
| R2 | existing node CRUD | works, gains audit row |
| R3 | non-workspace endpoints (sso) | unaffected |
