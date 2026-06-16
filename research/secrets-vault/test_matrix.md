# Test Matrix — Secrets Vault

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_1_secrets_vault/test_matrix.md

## Happy Path
| ID | Scenario | Expected |
|---|---|---|
| H1 | Save secret global var | DB stores ciphertext |
| H2 | List secret var | `***` returned |
| H3 | Runner resolves secret | Decrypted value sent to target |
| H4 | Enc→dec roundtrip | Identical output |

## Edge Cases
| ID | Scenario | Expected |
|---|---|---|
| E1 | Flip is_secret false→true | Value re-encrypted |
| E2 | Key rotation (versioned prefix) | Old + new ciphertext both decrypt |
| E3 | Existing plaintext secrets pre-backfill | Runner still resolves (passthrough) |

## Error Cases
| ID | Scenario | Expected |
|---|---|---|
| X1 | SECRET_ENC_KEY unset in prod | Fail fast at startup |
| X2 | Decrypt corrupt ciphertext | Safe error, logged (no value), not 500 leak |
| X3 | Any endpoint returns plaintext secret | MUST never happen |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | Non-secret vars | Plaintext, unchanged |
| R2 | Runner case execution | Resolves secrets correctly |
