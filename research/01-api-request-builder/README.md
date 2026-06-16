# 01 — API Request Builder

Status: Partial
Coverage: 75%

## Implemented
- HTTP methods: GET/POST/PUT/DELETE/PATCH
- URL builder with `{{VAR}}` resolution
- Query params (key/value)
- Headers (folder-inherited + per-request)
- Request body types: raw/JSON, form-data, url-encoded
- GraphQL body mode

## Missing
- Path params (`{id}` style) — stored in endpoint string, no dedicated binding UI
- cURL import/paste-to-request
- Request/response code snippet generator
- Binary file upload body type

## Current Task
None — blocked on cURL round-trip (feature 06-authentication / 11-documentation ships cURL via spec feature)

## Next Task
Path param binding UI (FE only — backend already stores `{id}` in endpoint string)

## Dependencies
- 04-variables (for `{{VAR}}` preview in URL bar)
- 06-authentication (auth tab in request panel)

## Priority
P1
