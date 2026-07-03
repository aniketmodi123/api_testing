# Test Matrix — Alerts

LAST_UPDATED: 2026-06-16

## Happy Path
| ID | Scenario | Expected |
|---|---|---|
| H1 | Execution fails, alert on failure | Alert fired |
| H2 | Execution succeeds, alert on success | Alert fired |
| H3 | Execution partial, no alert configured for partial | No alert |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | Alert fires after schedule execution | Unchanged |
