# Test Matrix — Version Control (Node Snapshots)

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_11_collaboration/README.md

## Happy Path
| ID | Scenario | Expected |
|---|---|---|
| H1 | Snapshot collection | NodeVersion created with full subtree JSON |
| H2 | List versions | Ordered by created_at |
| H3 | Restore snapshot | Apis/cases upserted; extras left alone |
| H4 | Restore audited | audit_logs row: `node.version.restore` |

## Edge Cases
| ID | Scenario | Expected |
|---|---|---|
| E1 | Restore into collection with extra APIs (not in snapshot) | Extras preserved |
| E2 | Restore into empty collection | All from snapshot created |

## Error Cases
| ID | Scenario | Expected |
|---|---|---|
| X1 | Viewer tries to restore | 403 |
| X2 | Restore non-existent version | 404 |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | Node tree walk | Unchanged |
| R2 | Audit log | Unchanged |
