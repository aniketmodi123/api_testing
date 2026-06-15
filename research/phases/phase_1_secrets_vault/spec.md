# Spec — Secrets Vault

STATUS: not-started
LAST_CHANGED: 2026-06-15

## Goal
Encrypt secret variable values at rest; decrypt only at resolution; never expose plaintext to client.

## Deliverables
1. `SecretsProvider` (encrypt/decrypt) — Fernet MVP, key from env.
2. Write path: `GlobalVariable.value` + `Environment.variables[secret]` stored as ciphertext when secret.
3. Read path: list endpoints keep masking `***`; runner resolves via decrypt.
4. Migration: backfill-encrypt existing secrets; expand→migrate→contract.

## Backend Changes
### New Models
| Model | Fields | Notes |
| (none) | — | reuse existing columns, store ciphertext in same field |

### New Endpoints
| (none) | — | — |

### Modified Endpoints / Logic
| File | Change |
|---|---|
| (new) utils/secrets.py | `SecretsProvider`, `encrypt(v)`, `decrypt(v)`, Fernet impl |
| routers/variables/global_variables.py | encrypt on upsert when `is_secret`; raw helper decrypts |
| routers/environment/save_variables.py | encrypt secret entries on save |
| routers/environment/resolve_variables.py / resolve_api_variables.py | decrypt secrets at resolve |
| common_querys.py `get_workspace_variables` / `get_global_variables_for_user` | return decrypted for runner only |
| config.py | `SECRET_ENC_KEY` (required in prod) |
| (new) alembic revision | backfill: encrypt existing plaintext secrets |

## Frontend Changes
| (none) | — | masking already server-side; ensure no plaintext field added |

## Decision Table
| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Cipher | Fernet (symmetric, AEAD) | simple, std, key-rotatable; KMS later |
| 2 | Storage | ciphertext in existing value/JSON field | no schema churn, additive |
| 3 | Which values | only `is_secret=True` | non-secret stay plaintext for searchability |
| 4 | Key source | env `SECRET_ENC_KEY` | 12-factor; rotate via re-encrypt job |
| 5 | Differentiator | self-hosted, never to client | X5 edge |
| 6 | Env var encryption | Deferred to Phase 4 — `Environment.variables` has no per-entry `is_secret` flag; adding one now is a schema break. Flag + encryption added when Phase 4 introduces per-entry metadata. | additive-first |
| 7 | secrets.py name | Renamed to `vault.py` — `secrets` is a stdlib module; bare import `from secrets import` would hit stdlib. | naming collision |
| 8 | Alembic backfill | No Alembic yet (Phase 0); backfill delivered as `scripts/backfill_encrypt_secrets.py` — idempotent, skips already-ciphertext rows. | phase dependency |

## Edge Cases
| # | Trap | How it breaks | Fix |
|---|---|---|---|
| 1 | Toggle is_secret false→true on existing value | stored plaintext stays plaintext | re-encrypt on flag change |
| 2 | Missing SECRET_ENC_KEY in prod | decrypt fails silently | fail fast at startup if unset in prod |
| 3 | Key rotation | old ciphertext undecryptable | versioned key id prefix on ciphertext |
| 4 | Decrypted secret in flow_step_results/history | leak via run snapshot | mask secrets in any persisted snapshot |
| 5 | Env JSON mixes secret + non-secret | partial encrypt | per-entry encrypt, mark which keys secret |

## Open Questions
| # | Question | Recommendation |
|---|---|---|
| 1 | Per-entry secret marking in Environment.variables JSON | add `__secret_keys` list or shape `{value,is_secret}` |
| 2 | KMS/Vault timeline | interface now, impl post-MVP (O1) |
