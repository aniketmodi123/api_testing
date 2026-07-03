# Research — Secrets Vault

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_1_secrets_vault/research.md

## Existing Code
See 22-security/research.md for vault.py details.

## Encryption Points (where vault.py is called)
| Location | What's encrypted |
|---|---|
| `routers/variables/global_variables.py` | `GlobalVariable.value` when `is_secret=True` |
| `routers/node/variables.py` | `CollectionVariable.value` when `is_secret=True` |
| `routers/api/set_auth.py` | Secret fields in `Api.extra_meta.auth` |
| `routers/auth/oauth2.py` | `OAuthToken.access_token`, `OAuthToken.refresh_token` |

## Backfill Script
`scripts/backfill_encrypt_secrets.py` — idempotent; encrypts plaintext `is_secret` rows; skips already-ciphertext rows (detects by `v1:` prefix). No Alembic needed.

## Key Distribution
Same `SECRET_ENC_KEY` env var must be present in both API process and scheduler process (both supervisord processes).

## Gotchas
- `secrets` is a Python stdlib module — vault.py named `vault.py` to avoid import collision
- Runner opens its own session — vault.py must work outside request context (stateless, key from env)
