# Test Matrix — Collaboration (Comments)

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_11_collaboration/README.md

## Happy Path
| ID | Scenario | Expected |
|---|---|---|
| H1 | Post comment on node | Comment persisted |
| H2 | Reply to comment | parent_id set |
| H3 | List comments for entity | Threaded list returned |
| H4 | Author deletes own comment | Deleted |
| H5 | Admin deletes any comment | Deleted |

## Error Cases
| ID | Scenario | Expected |
|---|---|---|
| X1 | Non-author non-admin deletes comment | 403 |
| X2 | Edit comment | No such endpoint |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | Audit log writes for comment actions | Unchanged |
