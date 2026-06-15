# Spec — Auth Helpers

STATUS: not-started
LAST_CHANGED: 2026-06-15

## Goal
Add declarative per-request auth for all Postman auth types, injected at send, secrets encrypted, folder-inheritable.

## Deliverables
1. Auth config schema per type stored in `Api.extra_meta.auth` (MVP, no new table).
2. Inject resolved auth into outbound request in execute_direct + runner.
3. OAuth2 grants + `oauth_tokens` cache (ciphertext) + refresh-on-expiry.
4. Folder inheritance (auth flows root→leaf like headers).
5. FE AuthBuilder.

## Backend Changes
### New Models
| Model | Fields | Notes |
|---|---|---|
| OAuthToken | id, owner_username(idx), auth_ref(uniq w/ owner), access_token(enc), refresh_token(enc,null), token_type, expires_at, created_at | cache to avoid re-grant |

### New Endpoints
| Method | Path | Min Role | Purpose |
|---|---|---|---|
| PUT | /api/{api_id}/auth | editor | set auth {type, config} |
| POST | /auth/oauth2/token | editor | fetch+cache token |
| GET | /auth/oauth2/token/{auth_ref} | editor | token status (never raw) |

### Modified Endpoints / Logic
| File | Change |
|---|---|
| routers/api/save_api.py | accept/persist `extra_meta.auth` (encrypt secret fields) |
| routers/runner/execute_direct.py | build auth → headers/query/signature before send |
| routers/runner/run_case.py + bulk_run_cases.py | same injection in case runs |
| common_querys.py | `resolve_auth(file_id)` — merge inherited auth root→leaf |
| (new) utils/auth_strategies.py | apikey/bearer/basic/aws_sigv4/jwt builders |
| (new) routers/auth/oauth2.py | grant flows + cache |
| main.py | register oauth2 router, import OAuthToken |

## Frontend Changes
### New Components
| Component | Location | Purpose |
| AuthBuilder | components/RequestPanel | type select + per-type form, masked secrets |
### Modified Components
| RequestPanel | replace inline none/bearer/basic block (lines ~630/1719) with AuthBuilder |

## Decision Table
| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Auth storage | `Api.extra_meta.auth` JSON | additive, no migration (MVP); table later if needed |
| 2 | Secrets in config | encrypt via SecretsProvider | reuse phase_1; never plaintext to client |
| 3 | OAuth token cache | `oauth_tokens` keyed by hash(client+scope+url) | avoid re-grant per request |
| 4 | Inheritance | reuse header root→leaf merge | X8 edge, consistent UX |
| 5 | AWS sigv4 | hand-rolled signer util | avoid heavy boto dep |

## Edge Cases
| # | Trap | How it breaks | Fix |
|---|---|---|---|
| 1 | OAuth token expired mid-run | 401 from target | refresh before send if `expires_at<=now+skew` |
| 2 | Inherited auth vs per-request override | ambiguous | leaf wins (same as headers) |
| 3 | apikey in query vs header | wrong placement | config has `in: header|query` |
| 4 | Basic auth special chars | bad base64 | encode utf-8 then b64 |
| 5 | Secret auth field in history snapshot | leak | scrub before persist (phase_1 rule) |
| 6 | aws clock skew | signature rejected | use server UTC, document |

## Open Questions
| # | Question | Recommendation |
|---|---|---|
| 1 | Auth in extra_meta vs RequestAuth table | start extra_meta; migrate to table if querying needed |
| 2 | OAuth auth-code redirect handling | backend callback endpoint + state param |
