# 06 — Authentication (Request Auth Helpers)

Status: Partial → done (backend complete, FE done)
Coverage: 90%

## Implemented
- Auth config stored on `Api.extra_meta.auth` (encrypted secret fields via vault.py)
- `PUT /api/{api_id}/auth` — set auth per API
- Auth strategies: apikey (header/query), bearer, basic (utf-8 b64), AWS SigV4, JWT builder
- OAuth2: client-credentials + refresh grant; `OAuthToken` cache table
- Folder-inherited auth (root→leaf merge, leaf wins) — X8 differentiator
- `AuthBuilder` FE component (7 types, masked secret inputs, reveal toggle)
- `apply_auth_async` dispatcher in `auth_strategies.py`
- `resolve_auth(file_id)` in `common_querys.py`

## Missing
- OAuth2 auth-code redirect flow (manual callback endpoint — deferred)
- Auth config UI for bulk runner / scheduled run (OAuth2 not supported in scheduler path — documented constraint)

## Current Task
None — feature complete

## Next Task
OAuth2 auth-code flow (low priority, P3)

## Dependencies
- 22-security (vault.py for secret encryption — done)
- 02-api-execution-engine (inject at send time — done)

## Priority
P0 (done)

## Differentiator
X8 — folder-inherited auth (deeper than Postman's shallow inheritance)
