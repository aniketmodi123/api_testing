# 12 — Mock Servers

Status: Partial
Coverage: 50%

## Implemented (backend)
- `MockServer` + `MockRoute` models
- Management endpoints: CRUD (server + route)
- `POST /mock/{server_id}/route/from-history` — create route from RequestHistory
- `POST /mock/{server_id}/route/from-result` — create route from BulkTestResult
- Public serve: `ANY /m/{public_token}/{path:path}` — matcher + template + delay + rate limit
- `resolve_variables` for dynamic response body (`{{$uuid}}` etc.)
- Rate limit: in-memory per-server counter (token-keyed)

## Missing
- FE MockServerList
- FE MockRouteEditor
- Rate limit persistence across restarts (Redis — deferred)

## Current Task
None (backend done)

## Next Task
FE MockServerList + MockRouteEditor

## Dependencies
- 04-variables (dynamic tokens `{{$uuid}}` in response body — done)
- 22-security (public route exemption in `security.py`)

## Priority
P2

## Differentiator
X10 — promote real captured responses into mock routes in one click (Postman requires manual example setup)
