# Phase 1 — Secrets Vault — encrypt secrets at rest (differentiator X5)

**Status:** not-started
**Phase:** 1
**Depends on:** Phase 0 (Alembic)
**Estimated scope:** backend-only · M

---

## What the user sees after this is done
Secret variables (env, global, and future auth configs) are stored **encrypted** in the DB and
never returned in plaintext to the browser. UX unchanged (still shows `***`), but a DB dump or
backup no longer leaks tokens. Differentiator: **self-hosted vault — secrets never leave your
infra**, unlike Postman's cloud vault.

## Deliverables
- [ ] `SecretsProvider` interface with Fernet implementation (key from `SECRET_ENC_KEY`)
- [ ] Encrypt `is_secret` values on write (env vars, global vars)
- [ ] Decrypt only inside the runner at send time; never serialize plaintext to client
- [ ] Migration: add ciphertext path, backfill existing secrets, stop storing plaintext (expand→migrate→contract)
- [ ] Pluggable backend stub for future Vault/KMS

## Tasks → Subtasks (execute in order; each subtask = one PR ≤1 day)
> Detail in spec.md / reuse in research.md. Check off when its test_matrix rows pass.

### T1 — Secrets provider   [files: vault.py, config.py, main.py]   [done when: H4,X1 green]
- [x] T1.1 `vault.py` — `encrypt()`/`decrypt()`/`is_ciphertext()` Fernet impl; `v1:` version prefix; legacy plaintext passthrough
- [x] T1.2 Fail-fast at startup (`main.py` startup_event) if `SECRET_ENC_KEY` unset

### T2 — Encrypt on write   [files: variables/global_variables.py]   [reuse: existing upsert]   [done when: H1,E1 green]
- [x] T2.1 Encrypt `GlobalVariable.value` when `is_secret`; re-encrypt on flag flip
- [ ] T2.2 Encrypt per-entry secret env vars — DEFERRED to Phase 4 (no `is_secret` flag on env var entries in current schema; adding it now is a breaking change)

### T3 — Decrypt at resolve   [files: variables/global_variables.py]   [done when: H2,H3 green]
- [x] T3.1 Decrypt secrets in `get_global_variables_for_user` (runner path only)
- [x] T3.2 List endpoint keeps masking `***`; ciphertext never returned to client
- [ ] T3.3 Scrub secret values from persisted run snapshots — carry to Phase 2 (audit + results)

### T4 — Backfill   [files: scripts/backfill_encrypt_secrets.py]   [done when: R2 green]
- [x] T4.1 Idempotent backfill script: encrypts plaintext `is_secret` rows; skips already-ciphertext; no Alembic needed
- [ ] T4.2 Verify same key in API + scheduler — document in `.env.example` (carry to Phase 0 DevOps)

## AI agent files
| File | Purpose |
|---|---|
| spec.md | Backend changes, decisions, edge cases |
| research.md | Existing code to reuse |
| test_matrix.md | Acceptance tests |
