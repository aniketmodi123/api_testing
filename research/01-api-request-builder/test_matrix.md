# Test Matrix — API Request Builder

LAST_UPDATED: 2026-06-16

## Happy Path
| ID | Scenario | Expected |
|---|---|---|
| H1 | Send GET request | Response displayed |
| H2 | Send POST with JSON body | Body sent, response displayed |
| H3 | Headers added | Headers sent in request |
| H4 | Query params added | Appended to URL |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | execute-direct response shape | Unchanged |
| R2 | Variable resolution in URL | Unchanged |
