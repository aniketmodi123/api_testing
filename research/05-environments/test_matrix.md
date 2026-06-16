# Test Matrix — Environments

LAST_UPDATED: 2026-06-16

## Happy Path
| ID | Scenario | Expected |
|---|---|---|
| H1 | Create environment | Persisted, visible in switcher |
| H2 | Switch active environment | `{{VAR}}` resolves from new env |
| H3 | Delete environment | Removed, active resets to none |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | `{{VAR}}` resolution in request | Unchanged after 04-variables scope chain changes |
| R2 | Runner uses active environment | Unchanged |
