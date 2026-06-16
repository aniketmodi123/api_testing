# Research — Authentication (Request Auth Helpers)

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_3_auth_helpers/research.md

## Existing Code
| File | Function/Component | Notes |
|---|---|---|
| `backend/src/auth_strategies.py` | `build_apikey_auth`, `build_bearer_auth`, `build_basic_auth`, `build_aws_sigv4_auth`, `build_jwt_auth`, `apply_auth_async` | All auth builders + async dispatcher |
| `backend/src/routers/api/set_auth.py` | `PUT /api/{api_id}/auth` | Persist auth config; encrypt secrets |
| `backend/src/routers/auth/oauth2.py` | `fetch_oauth2_token` | Client-cred grant + cache |
| `backend/src/common_querys.py` | `resolve_auth(file_id)` | Merge inherited auth root→leaf |
| `backend/src/models.py` | `OAuthToken` | Cache table: `owner_username, auth_ref(uniq), access_token(enc), refresh_token(enc,null), expires_at` |
| `backend/src/schema.py` | `AuthNone, ApiKeyAuth, BearerAuth, BasicAuth, AwsSigV4Auth, JwtAuth, OAuth2Auth, SetAuthRequest` | Pydantic auth config models |
| `frontend/src/components/RequestPanel/AuthBuilder.jsx` | Auth type picker + per-type form | Masked secret inputs, reveal toggle |

## Inheritance Pattern (from common_querys.py)
```python
# header inheritance (already existed) — auth mirrors this exactly:
path = await get_folder_path_to_root(db, file_id)   # leaf→root list
# auth resolution: walk path, each node may have auth in extra_meta.auth
# leaf wins (most specific)
```

## OAuth2 Token Cache Key
```python
# Keyed by sha256(client_id + scope + token_url)
# expires_at <= now + 30s → refresh before send
```

## Known Constraints
- OAuth2 not supported in scheduled runs (scheduler uses sync `apply_auth`; OAuth2 needs async token fetch) — documented in spec
- `extra_meta.auth` namespace: avoids collision with existing `extra_meta` headers usage
