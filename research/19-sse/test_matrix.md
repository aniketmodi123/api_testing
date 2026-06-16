# Test Matrix — SSE

LAST_UPDATED: 2026-06-16

## Happy Path
| ID | Scenario | Expected |
|---|---|---|
| H1 | Connect to SSE target | Events stream to client |

## Error Cases
| ID | Scenario | Expected |
|---|---|---|
| X1 | Internal IP target | SSRF blocked, 400 |
| X2 | Target not an SSE endpoint | Connection error propagated |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | ws_proxy | Unchanged (separate proxy) |
