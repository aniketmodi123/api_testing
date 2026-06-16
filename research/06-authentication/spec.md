# Spec — Authentication (Request Auth Helpers)

STATUS: done
LAST_CHANGED: 2026-06-16
SOURCE: phases/phase_3_auth_helpers/spec.md

## Goal
Declarative per-request auth for all Postman auth types, injected at send time, secrets encrypted, folder-inheritable. Differentiator X8.

## Backend (all shipped)

### Models
| Model | Fields |
|---|---|
| OAuthToken | id, owner_username(idx), auth_ref(uniq w/ owner), access_token(enc), refresh_token(enc,null), token_type, expires_at, created_at |

### Endpoints
| Method | Path | Min Role | Purpose |
|---|---|---|---|
| PUT | `/api/{api_id}/auth` | editor | Set auth config (secrets encrypted) |
| POST | `/auth/oauth2/token` | editor | Fetch + cache OAuth2 token |
| GET | `/auth/oauth2/token/{auth_ref}` | editor | Token status (never raw token) |

### Files
| File | Purpose |
|---|---|
| `auth_strategies.py` | All auth builders + `apply_auth_async` dispatcher |
| `routers/api/set_auth.py` | `PUT /api/{id}/auth` |
| `routers/auth/oauth2.py` | OAuth2 grant + refresh + cache |
| `common_querys.py` `resolve_auth` | Root→leaf auth merge |

## Frontend (shipped)
- `AuthBuilder.jsx` — 7 auth types, masked secrets, replaces inline bearer/basic block

## Decision Table
| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Auth storage | `Api.extra_meta.auth` JSON | Additive, no migration; table later if querying needed |
| 2 | Secrets in config | Encrypt via vault.py | Reuse phase_1; never plaintext to client |
| 3 | OAuth token cache | `oauth_tokens` keyed by hash(client+scope+url) | Avoid re-grant per request |
| 4 | Inheritance | Root→leaf like headers | X8 edge, consistent UX |
| 5 | AWS SigV4 | Hand-rolled signer | Avoid heavy boto dep |

## Known Constraints
- OAuth2 not in scheduler path (sync worker; OAuth2 needs async)
- Auth-code redirect flow deferred (needs callback endpoint + state param)
