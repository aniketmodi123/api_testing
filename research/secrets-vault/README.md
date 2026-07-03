# Secrets Vault

Status: Partial
Coverage: 70%

## Implemented
- `vault.py` — Fernet encrypt/decrypt; `v1:` version prefix; legacy plaintext passthrough
- Global variables encrypted at rest (is_secret=True values stored as ciphertext)
- Fail-fast at startup if `SECRET_ENC_KEY` unset
- Backfill script: `scripts/backfill_encrypt_secrets.py` (idempotent)
- Decrypt only at runner resolve time; never serialize plaintext to client

## Missing
- Per-entry `is_secret` on environment variables (deferred — see 04-variables)
- Secret scrub from bulk_test_results run snapshots (T3.3 deferred)
- KMS/Vault backend interface (stub only)

## Current Task
None (MVP done)

## Next Task
Per-entry env var encryption (blocked on 04-variables schema change)

## Dependencies
- 22-security (vault.py lives here — done)

## Priority
P0 (done)

## Differentiator
X5 — self-hosted vault; secrets never leave your infrastructure
