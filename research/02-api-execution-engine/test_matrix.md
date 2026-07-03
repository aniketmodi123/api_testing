# Test Matrix — API Execution Engine

LAST_UPDATED: 2026-06-16

## Happy Path
| ID | Scenario | Expected |
|---|---|---|
| H1 | Send to valid TLS host | Response returned, verify=True |
| H2 | Auth injected | Authorization header present |
| H3 | Variables resolved in URL | Final URL has substituted values |
| H4 | Response persisted in history | RequestHistory row created |

## Error Cases
| ID | Scenario | Expected |
|---|---|---|
| X1 | SSRF target | 400, blocked |
| X2 | TLS cert failure | Error, not silently bypassed |
| X3 | Timeout | Timeout error, not hang |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | execute_direct response shape | Unchanged after send_request extraction |
| R2 | run_case + bulk_run | Same send path |
