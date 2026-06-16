# 18 — WebSocket

Status: Existing
Coverage: 85%

## Implemented
- WebSocket proxy (`ws_proxy.py`) — relay to target WS endpoint
- `WebSocketPanel` FE component
- SSRF guard on target URL before connect

## Missing
- Message history persistence (currently in-memory only)
- Binary message support

## Current Task
None

## Next Task
Message history persistence (low priority)

## Dependencies
- 22-security (SSRF guard — done)

## Priority
P3
