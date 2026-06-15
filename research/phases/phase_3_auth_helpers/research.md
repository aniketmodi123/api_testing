# Research — Auth Helpers

LAST_UPDATED: 2026-06-15

## Existing Code to Reuse
| File | Function/Component | How to use |
|---|---|---|
| routers/runner/execute_direct.py | request build + httpx send (final_headers, body_type) | inject auth into final_headers/params/url here |
| common_querys.py | `get_headers`, `get_folder_path_to_root`, `get_headers_for_folders`, `merge_headers_with_priority` | copy this inheritance pattern for `resolve_auth` |
| routers/api/save_api.py | persists `Api.extra_meta` | extend to hold `auth` block |
| utils/secrets.py (phase_1) | encrypt/decrypt | secrets in auth config |
| utils/http_client.py (phase_0) | pooled client | OAuth token fetch uses it |
| frontend RequestPanel.jsx (~630, ~1719) | existing authType none/bearer/basic | replace with AuthBuilder |
| frontend store/apiSlice.js | RTK Query endpoints | add setAuth, oauthToken hooks |

## Patterns in this Codebase
```python
# Header inheritance to mirror for auth (common_querys.py):
path = await get_folder_path_to_root(db, file_id)
hmap = await get_headers_for_folders(db, folder_ids)
merged = merge_headers_with_priority(path, hmap)   # child overrides parent

# Injection point (execute_direct.py) already assembles final_headers:
final_headers['Content-Type'] = ...   # add: final_headers['Authorization'] = built_auth
```
```js
// RequestPanel already sets Authorization header from bearer (line ~1744) — generalize:
setHeaders(prev => [...prev, { key: 'Authorization', value: `Bearer ${tok}` }])
```

## API Contracts
| Endpoint | Input | Output | Notes |
|---|---|---|---|
| PUT /api/{id}/auth | {type, config} | ok | config secrets encrypted server-side |
| POST /auth/oauth2/token | {client_id,secret,token_url,scope,grant} | {auth_ref,expires_at} | token cached, never returned raw |

## Component Patterns
AuthBuilder = dropdown + conditional form per type; mirror existing HeaderEditor styling; masked inputs for secrets; never echo stored secret back (show `***`, allow overwrite only).

## Gotchas
| # | Thing | Why it trips you up | How to handle |
|---|---|---|---|
| 1 | FE currently writes Authorization into headers list directly | double auth if also injected backend | move source-of-truth to auth config; FE preview only |
| 2 | extra_meta already used for file headers | key collision | namespace under `extra_meta.auth` |
| 3 | OAuth fetch is outbound | SSRF + TLS | route via phase_0 client + ssrf guard |
| 4 | runner has 3 entry points (direct/case/bulk) | inject in one, miss others | centralize in `resolve_auth` + shared inject fn |
