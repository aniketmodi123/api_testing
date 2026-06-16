# Test Matrix — Administration

LAST_UPDATED: 2026-06-16

## Happy Path
| ID | Scenario | Expected |
|---|---|---|
| H1 | GET /meta/comparison | 16 feature rows, no auth required |
| H2 | God user access | Bypasses workspace membership check |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | `/meta/` public exemption in security.py | Unchanged |
