# Research — Mock Servers

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_8_mock_servers/spec.md

## Existing Code
| File | Purpose |
|---|---|
| `backend/src/routers/mock/` | All mock server endpoints |
| `backend/src/models.py` | `MockServer`, `MockRoute` models |
| `backend/src/utils.py` | `resolve_variables` — used for dynamic response body |
| `backend/src/security.py` | `/m/` prefix exempted from auth (public serve) |

## MockServer Model
```
MockServer
  id, workspace_id(FK CASCADE), name, description(nullable)
  public_token    varchar(64) unique  — secrets.token_hex(32)
  enabled         bool default True
  rate_limit      int default 60  (req/min; 0=unlimited)
```

## MockRoute Model
```
MockRoute
  id, server_id(FK CASCADE), method(varchar10), path(varchar500)
  status_code     int default 200
  response_headers JSON nullable
  response_body   text nullable  (templated — {{$uuid}} etc)
  delay_ms        int default 0
  priority        int default 0  (higher = matched first)
```

## Serve Logic
1. Look up MockServer by public_token → 404 if missing; 503 if not enabled
2. Match route: `method == request.method` AND path template matches request path
   - Path template: `{param}` segments are wildcards
   - Split both on `/`; wildcard segments match any segment
   - Among matches, pick highest `priority`
3. Apply `delay_ms` (asyncio.sleep)
4. Resolve `response_body` via `resolve_variables` with dynamic tokens
5. Return response with `status_code + response_headers + body`
6. Rate limit: in-memory dict per token + timestamp window; 429 when exceeded

## "Create from history/result" Pattern
- Reads `request_history.response` or `bulk_test_results.response` JSON
- Copies `status_code`, `response_headers`, `response_body` into new MockRoute
- No auth/creds copied (security)

## Gotchas
- Rate limit resets on process restart (in-memory MVP)
- OAuth2 auth not applicable — serve route is public/no-auth
- `public_routes` in security.py needs prefix match (`/m/`) not exact match
