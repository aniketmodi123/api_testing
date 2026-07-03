# Test Matrix — Testing (Assertions + Validation)

LAST_UPDATED: 2026-06-16

## Happy Path
| ID | Scenario | Expected |
|---|---|---|
| H1 | Status code assertion passes | Pass recorded |
| H2 | Body key assertion passes | Pass recorded |
| H3 | jsonschema validation passes | Pass recorded |
| H4 | Assertion failure | Fail recorded with expected vs actual |

## Error Cases
| ID | Scenario | Expected |
|---|---|---|
| X1 | Non-JSON body with jsonschema assertion | Safe error, not 500 |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | Runner assertions via bulk_run | Unchanged |
| R2 | validator.py called from run_case | Unchanged |
