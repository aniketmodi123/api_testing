# Phase 3 — Auth Helpers — declarative request auth (API key/OAuth2/AWS/JWT/Basic)

**Status:** not-started
**Phase:** 3
**Depends on:** Phase 1 (secrets), Phase 0 (http client)
**Estimated scope:** full-stack · L

---

## What the user sees after this is done
The request Auth tab supports all the auth types Postman has — none, API Key, Bearer, Basic,
OAuth2, AWS Signature v4, JWT — configured per API and inherited down folders (differentiator
X8). OAuth2 tokens are fetched + cached automatically. Secrets in auth config are encrypted (X5).

## Deliverables
- [ ] Declarative auth config stored on API (`extra_meta.auth`), secrets encrypted
- [ ] Auth injection at send time in execute_direct: apikey/bearer/basic/aws_sig/jwt
- [ ] OAuth2: client-credentials + auth-code grant; `oauth_tokens` cache + refresh
- [ ] Folder-inherited auth (reuse header-inheritance pattern)
- [ ] FE `AuthBuilder` (replaces inline none/bearer/basic) with per-type forms
- [ ] Tests: signing correctness, token fetch/cache, inject, 401/422

## Tasks → Subtasks (execute in order; each subtask = one PR ≤1 day)
> Detail in spec.md / reuse in research.md. Check off when its test_matrix rows pass.

### T1 — Auth schema + store   [files: api/save_api.py]   [reuse: Api.extra_meta, secrets provider]   [done when: PUT /api/{id}/auth persists, secrets encrypted]
- [ ] T1.1 Pydantic v1 auth config models per type
- [ ] T1.2 `PUT /api/{api_id}/auth` (encrypt secret fields)

### T2 — Inject simple   [files: utils/auth_strategies.py, runner/execute_direct.py]   [done when: H1,H2,H3,H4 green]
- [ ] T2.1 apikey (header/query), bearer, basic (utf-8 b64) builders
- [ ] T2.2 Inject into final_headers/params/url before send

### T3 — Inject signed   [files: utils/auth_strategies.py]   [done when: H6,H7,E4 green]
- [ ] T3.1 AWS SigV4 signer (hand-rolled, server UTC)
- [ ] T3.2 JWT builder (claims + secret)

### T4 — OAuth2 + cache   [files: routers/auth/oauth2.py, models.py, alembic]   [reuse: http_client, ssrf]   [done when: H5,E1,X1,X4 green]
- [ ] T4.1 `OAuthToken` model + migration
- [ ] T4.2 client-credentials grant + cache keyed by hash(client+scope+url)
- [ ] T4.3 auth-code grant + callback/state
- [ ] T4.4 refresh when `expires_at<=now+skew`; `GET token status` (never raw)

### T5 — Inheritance   [files: common_querys.py]   [reuse: header root→leaf merge]   [done when: H8,E2 green]
- [ ] T5.1 `resolve_auth(file_id)` merging folder→file (leaf wins)
- [ ] T5.2 Apply in run_case + bulk_run_cases (one shared inject fn)

### T6 — AuthBuilder UI   [files: components/RequestPanel/AuthBuilder, store/apiSlice.js]   [done when: per-type form works, secrets masked]
- [ ] T6.1 AuthBuilder component (type select + per-type form, masked secrets)
- [ ] T6.2 Replace inline none/bearer/basic block; add RTK Query hooks

## AI agent files
| File | Purpose |
|---|---|
| spec.md | Backend + frontend changes, decisions, edge cases |
| research.md | Existing code to reuse |
| test_matrix.md | Acceptance tests |
