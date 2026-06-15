# Phase 0 — Platform Hardening — foundation that unblocks every new table & secret

**Status:** not-started
**Phase:** 0
**Depends on:** none
**Estimated scope:** backend-only · L

---

## What the user sees after this is done
Nothing visual changes. Under the hood: schema changes become safe (Alembic), outbound calls
verify TLS by default and refuse internal/SSRF targets, logs are structured and searchable, and
CORS is locked to known origins in prod. This is the safety floor every later phase stands on.

## Deliverables
- [ ] Alembic adopted; current schema baseline-stamped; up/down proven
- [ ] `print()` calls replaced with existing `logs()` structured logger
- [ ] Single pooled outbound httpx client with `verify` flag (default True) + timeout/retry
- [ ] SSRF guard util (block private CIDR / link-local / metadata IP; DNS pin)
- [ ] CORS origins restricted via env (prod) — keep `*` only in dev

## Tasks → Subtasks (execute in order; each subtask = one PR ≤1 day)
> Detail in spec.md / reuse in research.md. Check off when its test_matrix rows pass.

### T1 — Alembic migrations   [files: alembic/, alembic.ini, env.py]   [reuse: config.py engine]   [done when: H1,H2,E3 green]
- [ ] T1.1 Add alembic, async `env.py` reusing `create_async_engine`/DB URL from config.py
- [ ] T1.2 Autogenerate-compare vs current models; baseline revision 0
- [ ] T1.3 `alembic stamp head`; prove up/down on throwaway DB
- [ ] T1.4 Gate `Base.metadata.create_all` behind a dev-only flag

### T2 — Structured logging   [files: security.py, runner/*]   [reuse: utils.logs/setup_logger]   [done when: H4,X-no-secret green]
- [ ] T2.1 Replace `print(...)` in security.py with `logs(..., type='error')` (no token/PII)
- [ ] T2.2 Replace stray prints in runner; add request-boundary log

### T3 — Pooled outbound client   [files: utils/http_client.py, config.py, runner/execute_direct.py]   [reuse: existing httpx usage]   [done when: H3,E1,X4,R1 green]
- [ ] T3.1 Singleton pooled `AsyncClient` (timeout, bounded retry)
- [ ] T3.2 `OUTBOUND_VERIFY_TLS` config (default True) + per-request opt-out
- [ ] T3.3 Route execute_direct through it (remove hardcoded `verify=False`)

### T4 — SSRF guard   [files: utils/ssrf.py, runner/execute_direct.py, runner/ws_proxy.py]   [done when: E2,X1,X2,R2 green]
- [ ] T4.1 `assert_safe_url(url)` — resolve host, reject private/link-local/169.254/metadata, DNS-pin
- [ ] T4.2 Call before every outbound send + ws connect

### T5 — CORS + scheduler lock   [files: main.py, config.py, scheduler]   [done when: X3,R3 green]
- [ ] T5.1 `CORS_ORIGINS` env-driven; `*` only in dev
- [ ] T5.2 Scheduler due-poll uses `SELECT ... FOR UPDATE SKIP LOCKED` (R4 double-run guard)

## AI agent files
| File | Purpose |
|---|---|
| spec.md | Backend changes, decisions, edge cases |
| research.md | Existing code to reuse, patterns, contracts |
| test_matrix.md | Acceptance tests, edge cases |
