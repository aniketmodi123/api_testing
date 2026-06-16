# Spec — API Execution Engine

STATUS: mostly done; send_request() extraction pending
LAST_CHANGED: 2026-06-16

## Shipped
- Pooled outbound client (http_client.py)
- SSRF guard (ssrf.py)
- TLS verify flag
- Auth injection (auth_strategies.py)
- Variable resolution before send

## Pending
Extract `send_request()` callable from execute_direct.py so the flow engine (10-workflows) can reuse it without going through the HTTP handler.

## Decision Table
| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Shared send fn | Extract from execute_direct | DRY — flow engine + direct share same auth/var/ssrf path |
| 2 | Session management | Handler persists history; engine does not | Separation of concerns |
