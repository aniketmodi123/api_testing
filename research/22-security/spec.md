# Spec — Security

STATUS: mostly done (Alembic deferred)
LAST_CHANGED: 2026-06-16
SOURCE: phases/phase_0_platform_hardening/spec.md + phases/phase_1_secrets_vault/spec.md

## Shipped
1. Alembic env setup — DEFERRED (T1 tasks: require DB access + ops coordination; `create_all` still used in dev)
2. ✅ Structured logging — `print()` → `logs()` (security.py, execute_direct.py)
3. ✅ Pooled outbound client — `http_client.py` singleton; `OUTBOUND_VERIFY_TLS` default True
4. ✅ SSRF guard — `ssrf.py`; applied in execute_direct, ws_proxy, sse_proxy, OAuth2, spec import
5. ✅ CORS origins — `CORS_ORIGINS` env-driven; `*` only in dev
6. ✅ Secret encryption — `vault.py` Fernet; global vars + collection vars encrypted at rest

## Deferred
| Task | Reason |
|---|---|
| Alembic baseline stamp | Requires DB access + ops coordination |
| Scheduler `SELECT FOR UPDATE SKIP LOCKED` | Scheduler is separate process; coordinate separately |
| Per-entry `is_secret` on env vars | Breaking schema change; deferred to 04-variables |

## Decision Table
| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Migration tool | Alembic (deferred) | Only safe way to ALTER tables in prod |
| 2 | Logger | Reuse `logs()`/`setup_logger` in utils.py | Already structured; no new dep |
| 3 | TLS default | verify=True; per-request opt-out | Close MITM vector |
| 4 | SSRF policy | Deny private/link-local/169.254/metadata; allowlist override | Block runner/proxy abuse |
| 5 | HTTP client | One pooled singleton | Reuse connections, central policy |
| 6 | Cipher | Fernet (symmetric, AEAD) | Simple, std, key-rotatable |
