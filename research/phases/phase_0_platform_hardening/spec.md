# Spec — Platform Hardening

STATUS: not-started
LAST_CHANGED: 2026-06-15

## Goal
Establish migration, logging, safe-outbound, and CORS foundations before any feature table lands.

## Deliverables
1. Alembic with async env; revision 0 = baseline stamp of current `create_all` schema.
2. Replace `print(...)` (security.py, runner) with `logs(msg, type='error')` from utils.py.
3. Pooled outbound httpx client w/ TLS verify flag (default True), timeout, bounded retry.
4. SSRF guard util used by execute_direct / ws_proxy / future proxies.
5. CORS allow_origins from env; default-deny in prod.

## Backend Changes
### New Models
| Model | Fields | Notes |
| (none) | — | infra only; Alembic baseline of existing tables |

### New Endpoints
| Method | Path | Purpose |
| (none) | — | no new routes |

### Modified Endpoints / Logic
| File | Change |
|---|---|
| (new) alembic/ + alembic.ini + env.py | async migrations; baseline revision |
| security.py | `print(...)` → `logs(..., type='error')` (no token/PII in message) |
| routers/runner/execute_direct.py | use shared client; `verify` from config not hardcoded False |
| routers/runner/ws_proxy.py | route target through SSRF guard |
| (new) utils/http_client.py | singleton `AsyncClient`, pooled, timeout/retry |
| (new) utils/ssrf.py | `assert_safe_url(url)` — resolve host, reject private/link-local/metadata |
| main.py CORS | `allow_origins=settings.cors_origins` |
| config.py | add `OUTBOUND_VERIFY_TLS` (default True), `CORS_ORIGINS`, `SECRET_ENC_KEY` placeholder |

## Frontend Changes
### New Components
| (none) | — | — |

## Decision Table
| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Migration tool | Alembic | only safe way to ALTER / add tables; create_all can't |
| 2 | Logger | reuse `logs()`/`setup_logger` in utils.py | already structured; no new dep, matches house style |
| 3 | TLS default | verify=True; per-request opt-out flag | close S3 MITM; keep localhost path |
| 4 | SSRF policy | deny private/link-local/169.254/metadata; allowlist override | block runner/proxy abuse (S10) |
| 5 | HTTP client | one pooled singleton | reuse connections, central policy (B8) |
| 6 | Scheduler double-run guard | `SELECT ... FOR UPDATE SKIP LOCKED` on due schedules | prevent R4 at >1 worker |

## Edge Cases
| # | Trap | How it breaks | Fix |
|---|---|---|---|
| 1 | Baseline stamp on a DB that already has tables | duplicate create | `alembic stamp head` after autogenerate-compare, don't re-create |
| 2 | localhost / self-host targets need no TLS | verify=True breaks them | per-request `verify` opt-out + allowlist |
| 3 | DNS rebinding bypasses CIDR check | SSRF slips through | resolve + pin IP, re-check after resolve |
| 4 | CORS too strict blocks dev | frontend calls fail | env-driven, `*` in dev profile |
| 5 | Replacing print loses context | harder debug | structured fields (event, status), never secrets |

## Open Questions
| # | Question | Recommendation |
|---|---|---|
| 1 | Retry lib (tenacity vs hand-rolled) | hand-rolled minimal backoff to avoid new dep |
| 2 | SSRF allowlist storage | env CSV for MVP; table later |
