# Test Matrix — Variable Scopes

LAST_UPDATED: 2026-06-15

## Happy Path
| ID | Scenario | Input | Expected |
|---|---|---|---|
| H1 | Collection var CRUD | upsert/list/delete | persisted, scoped to node |
| H2 | Precedence | key in global+env | env value wins |
| H3 | Full chain | key in all 4 | local wins |
| H4 | Dynamic {{$uuid}} | in body | valid uuid substituted |
| H5 | Preview | text + file_id | resolved + winning scope per var |

## Edge Cases
| ID | Trap # | Scenario | Expected |
|---|---|---|---|
| E1 | 2 | nested folders same key | deepest collection wins |
| E2 | 3 | {{$randomInt}} in url + assertion | same value both places per run |
| E3 | 5 | unknown {{var}} | literal kept, flagged unresolved |
| E4 | 4 | secret collection var preview | masked |

## Error Cases
| ID | Scenario | Expected |
|---|---|---|
| X1 | viewer upserts collection var | 403 |
| X2 | duplicate key same node | upsert updates, no dup row |
| X3 | preview on node not owned | 403 |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | env var resolution {{VAR}} | unchanged |
| R2 | global var resolution | unchanged |
| R3 | ${ts} token | still works |
| R4 | runner case execution | resolves with new chain, same results for env-only setups |
