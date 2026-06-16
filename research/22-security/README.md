# 22 — Security (Platform Security + SSRF + Secrets)

Status: Partial
Coverage: 75%

## Implemented
- SSRF guard: `ssrf.py` — `assert_safe_url()` blocks private CIDR, link-local, 169.254, metadata IPs; DNS pin; `SSRF_ALLOWLIST` env override
- SSRF applied in: `execute_direct.py`, `ws_proxy.py`, `sse_proxy.py`, OAuth2 token fetch, spec import $ref
- Outbound TLS: `OUTBOUND_VERIFY_TLS` env flag (default True); pooled `http_client.py`
- CORS: `CORS_ORIGINS` env-driven; `*` only in dev
- Structured logging: `print()` replaced with `logs()` (no PII/token in messages)
- Secrets encrypted at rest: `vault.py` Fernet implementation for global vars + collection vars
- `SECRET_ENC_KEY` env required; fail-fast at startup

## Missing
- Alembic migrations (T1 deferred — requires DB access + ops coordination)
- Scheduler `SELECT FOR UPDATE SKIP LOCKED` (T5.2 deferred)
- Per-entry `is_secret` on environment variables (deferred to 04-variables)

## Current Task
None (most platform hardening done)

## Next Task
Alembic baseline stamp (when ops coordination available)

## Dependencies
None (this is a foundation feature)

## Priority
P0 (done)
