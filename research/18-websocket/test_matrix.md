# Test Matrix — WebSocket

LAST_UPDATED: 2026-06-16

## Happy Path
| ID | Scenario | Expected |
|---|---|---|
| H1 | Connect to WS target | Relay established |
| H2 | Send + receive messages | Bidirectional relay works |

## Error Cases
| ID | Scenario | Expected |
|---|---|---|
| X1 | Internal IP target | SSRF blocked |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | WebSocket relay | Unchanged after http_client changes |
