# Phase 3 — Architecture Review

LAST_UPDATED: 2026-06-15

> Reviews backend, frontend, database, caching, security, deployment. Identifies technical
> debt, bottlenecks, anti-patterns, missing abstractions, scalability risks → Risk Matrix.

---

## 1. Backend
**Strengths:** async end-to-end (FastAPI + asyncpg + httpx), uniform `create_response` wrapper, centralized `AuthMiddleware`, reusable helpers (`get_headers`, `resolve_variables`, `verify_node_ownership`), scheduler isolated as separate process.

**Debt / anti-patterns:**
| # | Issue | Why it bites | Severity |
|---|---|---|---|
| B1 | Business logic in route handlers (no service/repo layer) | hard to unit test, logic duplicated across runner endpoints | Med |
| B2 | `206` for not-found (non-HTTP-standard) | clients must special-case; breaks tooling/monitors | Med |
| B3 | `print()` used for errors (JWT decode etc.) | no structured logs, unsearchable in prod | High |
| B4 | `verify=False` on all outbound httpx | MITM risk against real targets | High |
| B5 | No migration tool (`create_all` only) | cannot do destructive/ALTER changes safely | High |
| B6 | Pydantic v1 | EOL; blocks v2 ecosystem; mixed-version risk | Med |
| B7 | Identity from `username` header (trusted) not solely JWT sub | header/JWT mismatch handled but fragile | Med |
| B8 | httpx client created per-request (`async with`) | no connection pooling reuse across calls | Low |

## 2. Frontend
**Strengths:** clean separation RTK Query (server) / Zustand (UI) / Redux (auth); CodeMirror editors; 30 modular components.

**Debt:**
| # | Issue | Severity |
|---|---|---|
| F1 | Auth UI only Bearer/Basic, sets raw header directly in component | Med |
| F2 | RequestPanel is large (2000+ lines) — god component | Med |
| F3 | No route-level code splitting evident (single Home page tree) | Low |
| F4 | Secret values round-trip to client (masking server-side only) | High |

## 3. Database
**Strengths:** good indexing on hot paths (`next_run`, history username/file, execution status), FK cascades, check constraints, unique constraints (global var key, member uniqueness).

**Debt:**
| # | Issue | Severity |
|---|---|---|
| D1 | No migrations → schema evolution risk | High |
| D2 | Secrets stored plaintext JSON (`Environment.variables`, `GlobalVariable.value`) | High |
| D3 | Heavy JSON columns (body/expected/response snapshots) — unindexed, can bloat | Med |
| D4 | `request_history` / `bulk_test_results` unbounded growth — no retention/partition | Med |
| D5 | `workspace_id` on schedules/history is plain Integer, not FK | Low |

## 4. Caching
| Observation | Note |
|---|---|
| RTK Query client cache | present, tag-based invalidation — good |
| Server-side cache | none beyond `sso_cache` (token blacklist) |
| Risk | variable/header resolution recomputed per request (cheap now; watch at scale) |

## 5. Security (summary — full in security-review.md)
CORS `*`, `verify=False`, plaintext secrets, `print` of decode errors, no audit log, no rate limiting beyond OTP lockout.

## 6. Deployment
| Observation | Note |
|---|---|
| supervisord 2-process | good separation |
| No migrations in deploy | blocks safe prod schema change |
| Single API process | no documented horizontal scaling / shared scheduler lock |
| Scheduler single instance | **risk:** 2 schedulers = double runs (no leader election) |

---

## Missing Abstractions (needed before scaling features)
1. **Service layer for runner** — execution logic reused by run_case, bulk, schedule, future flows.
2. **Auth-strategy abstraction** — pluggable request-auth (apikey/oauth/aws) vs today's inline header.
3. **Variable-resolution scope chain object** — global → collection → environment → local (only 2 scopes today).
4. **Secrets provider interface** — encrypt/decrypt boundary (env / Fernet / KMS / Vault).
5. **Outbound HTTP client singleton** — pooled, with timeout/retry/TLS policy.
6. **Migration framework** (Alembic) — precondition for most new tables.

---

## Risk Matrix
| ID | Risk | Likelihood | Impact | Severity | Mitigation |
|---|---|---|---|---|---|
| R1 | No migrations blocks new-feature tables safely | High | High | **Critical** | Adopt Alembic before Phase tables |
| R2 | Plaintext secrets leak | Med | High | **Critical** | Encrypt at rest (Fernet/KMS) |
| R3 | `verify=False` MITM on real targets | Med | High | High | Make TLS verify configurable, default on |
| R4 | Double scheduler runs at scale | Med | Med | High | Leader lock / `SELECT FOR UPDATE SKIP LOCKED` |
| R5 | Unbounded history/result tables | High | Med | High | Retention policy + partition/archival |
| R6 | CORS `*` + open creds | Med | Med | Med | Restrict origins in prod |
| R7 | `print` logging blinds prod debugging | High | Med | Med | Structured logger |
| R8 | God-component RequestPanel slows FE feature velocity | High | Low | Med | Decompose incrementally |
| R9 | Pydantic v1 EOL | Low | Med | Med | Plan v2 migration window |

---

## Validation Checklist — Phase 3
- [x] All six layers reviewed
- [x] Debt + anti-patterns enumerated with severity
- [x] Missing abstractions identified (feeds domain-model)
- [x] Risk matrix with likelihood/impact/mitigation
- [x] Scalability risks (scheduler, history growth, pooling) called out
