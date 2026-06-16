# Test Matrix — Audit Logs

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_2_audit_rbac/test_matrix.md

## Happy Path
| ID | Scenario | Expected |
|---|---|---|
| H1 | Editor creates node | Node created + audit row (action=node.create) |
| H2 | Admin reads audit | Paginated rows for workspace |
| H3 | require_role passes | Editor on write endpoint proceeds |

## Edge Cases
| ID | Scenario | Expected |
|---|---|---|
| E1 | Account-level action | Audit row workspace_id null |
| E2 | Audit insert fails mid-txn | Whole mutation rolls back |

## Error Cases
| ID | Scenario | Expected |
|---|---|---|
| X1 | Viewer hits write endpoint | 403, no mutation, no audit |
| X2 | Non-member reads /audit | 403 |
| X3 | Edit/delete an audit row | No such endpoint |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | Member invite/join/role | Unchanged + now audited |
| R2 | Existing node CRUD | Works, gains audit row |
