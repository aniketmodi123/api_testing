# 02 — API Execution Engine

Status: Partial
Coverage: 80%

## Implemented
- Direct execute (`POST /api/execute-direct`) — single request send
- Pooled outbound httpx client with TLS verify flag (`http_client.py`)
- SSRF guard (`ssrf.py` — blocks private CIDR, link-local, metadata IPs)
- Timeout + basic retry
- Auth injection: apikey/bearer/basic/oauth2/aws_sigv4/jwt (`auth_strategies.py`)
- Variable resolution before send (global→env chain)
- Body types: raw JSON, form-data, url-encoded
- Request history persistence (`request_history`)

## Missing
- Shared `send_request()` callable extracted from execute_direct (needed by Flow engine)
- Full 4-scope variable chain at send time (collection + local vars not yet wired)
- Per-request TLS opt-out UI

## Current Task
Extract `send_request()` shared callable — prerequisite for Flows (10-workflows)

## Next Task
Wire full variable scope chain into execute path

## Dependencies
- 22-security (SSRF guard — done)
- 04-variables (full scope chain)
- 06-authentication (auth injection — done)

## Priority
P0
