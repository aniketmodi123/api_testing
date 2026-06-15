# Test Matrix — Secrets Vault

LAST_UPDATED: 2026-06-15

## Happy Path
| ID | Scenario | Input | Expected | Notes |
|---|---|---|---|---|
| H1 | Save secret global var | {key,value,is_secret:true} | DB stores ciphertext, not plaintext | core |
| H2 | List secret var | GET | value = `***` | masking intact |
| H3 | Runner resolves secret | {{TOKEN}} in request | decrypted value sent to target | X5 |
| H4 | enc→dec roundtrip | any string | identical output | provider unit |

## Edge Cases
| ID | Trap # | Scenario | Expected |
|---|---|---|---|
| E1 | 1 | flip is_secret false→true | value re-encrypted |
| E2 | 3 | key rotation | versioned prefix decrypts old + new |
| E3 | 4 | secret used in bulk run | result snapshot masks secret |
| E4 | 5 | env JSON mixed secret/non-secret | only secret entries ciphertext |

## Error Cases
| ID | Scenario | Expected |
|---|---|---|
| X1 | SECRET_ENC_KEY unset in prod | fail fast at startup |
| X2 | decrypt corrupt ciphertext | safe error, logged (no value), not 500 leak |
| X3 | any endpoint returns plaintext secret | MUST never happen — assert in tests |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | non-secret vars | plaintext, searchable, unchanged |
| R2 | existing plaintext secrets pre-migration | runner still resolves during transition |
| R3 | env var resolution {{VAR}}/${ts} | unchanged for non-secret |
