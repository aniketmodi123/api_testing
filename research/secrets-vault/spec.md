# Spec — Secrets Vault

STATUS: in-progress (MVP done; env vars deferred)
LAST_CHANGED: 2026-06-16
SOURCE: phases/phase_1_secrets_vault/spec.md

## Goal
Secrets encrypted at rest; decrypt only at runner resolve time; never plaintext to client. Differentiator X5.

## Shipped
- Fernet encryption for global vars + collection vars + auth config secrets + OAuth tokens
- `vault.py` interface: `encrypt(v)`, `decrypt(v)`, `is_ciphertext(v)`
- Fail-fast at startup if `SECRET_ENC_KEY` unset

## Deferred
| Task | Reason |
|---|---|
| Per-entry env var encryption | `Environment.variables` no per-entry `is_secret` flag; shape change in 04-variables |
| Secret scrub from run snapshots | Carry to results/history cleanup pass |
| KMS/Vault backend | Interface stub only; implement post-MVP |

## Decision Table
| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Cipher | Fernet (symmetric, AEAD) | Simple, std, key-rotatable; KMS later |
| 2 | Storage | Ciphertext in existing value field | No schema churn |
| 3 | Key source | `SECRET_ENC_KEY` env | 12-factor; rotate via re-encrypt job |
| 4 | Version prefix | `v1:` | Enables key rotation + legacy passthrough |
| 5 | Naming | `vault.py` not `secrets.py` | `secrets` is Python stdlib — naming collision |
