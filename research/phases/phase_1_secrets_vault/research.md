# Research — Secrets Vault

LAST_UPDATED: 2026-06-15

## Existing Code to Reuse
| File | Function/Component | How to use |
|---|---|---|
| routers/variables/global_variables.py | upsert + `get_global_variables_for_user` | encrypt on upsert; decrypt in runner helper |
| routers/environment/save_variables.py | env var save | encrypt secret entries |
| routers/environment/resolve_variables.py | {{VAR}} resolve | decrypt before substitution |
| common_querys.py | `get_workspace_variables` | central decrypt point for runner |
| utils.py | `logs()` | log enc/dec failures (no value) |
| models.py | `GlobalVariable.is_secret`, `Environment.variables` | flags + JSON to hold ciphertext |

## Patterns in this Codebase
```python
# Current masking (global_variables.py) — keep masking, add encryption underneath:
"value": "***" if r.is_secret else r.value          # list response: unchanged
# write path becomes:
existing.value = secrets.encrypt(item.value) if item.is_secret else item.value
# runner read path:
raw = secrets.decrypt(r.value) if r.is_secret else r.value
```

## API Contracts
| Endpoint | Input | Output | Notes |
|---|---|---|---|
| GET /variables/global | — | values masked `***` | unchanged |
| POST /variables/global | items{value,is_secret} | ok | now encrypts secret values |
| /environment/resolve* | keys | resolved values | decrypts secrets internally |

## Component Patterns
N/A backend-only. FE must NOT add a "reveal secret" endpoint that returns plaintext.

## Gotchas
| # | Thing | Why it trips you up | How to handle |
|---|---|---|---|
| 1 | runner opens own session (`get_global_variables_for_user`) | decrypt must work outside request | provider is stateless, key from env |
| 2 | Existing rows are plaintext | runner can't tell | backfill migration sets a version prefix; treat unprefixed as plaintext during transition |
| 3 | Secret may appear in bulk_test_results.request/response | persisted leak | scrub secret values before snapshot save |
| 4 | Fernet key must match across API + scheduler process | mismatch = decrypt fail | same env var both supervisord processes |
