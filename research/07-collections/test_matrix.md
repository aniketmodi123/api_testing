# Test Matrix — Collections

LAST_UPDATED: 2026-06-16

## Happy Path
| ID | Scenario | Expected |
|---|---|---|
| H1 | Create folder | Node created, visible in tree |
| H2 | Create file under folder | parent_id set correctly |
| H3 | Move node | parent_id updated |
| H4 | Bulk import | Tree created with correct parent chain |
| H5 | Delete folder | Cascades to children |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | Header inheritance root→leaf | Unchanged |
| R2 | Auth inheritance root→leaf | Unchanged |
| R3 | Tree walk for runner | Unchanged |
