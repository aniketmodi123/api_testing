# Test Matrix — Response Viewer

LAST_UPDATED: 2026-06-16

## Happy Path
| ID | Scenario | Expected |
|---|---|---|
| H1 | Response displayed | Status, body, headers, duration shown |
| H2 | History loaded | Previous response shown |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | RequestHistory persistence | Unchanged |
