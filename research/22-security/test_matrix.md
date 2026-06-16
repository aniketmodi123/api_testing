# Test Matrix — Security

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_0_platform_hardening/test_matrix.md + phases/phase_1_secrets_vault/test_matrix.md

## Happy Path
| ID | Scenario | Expected |
|---|---|---|
| H1 | Outbound to valid TLS host | Request succeeds, verify=True |
| H2 | Logger emits structured line | Structured JSON, no secret |
| H3 | Secret global var save | DB stores ciphertext, not plaintext |
| H4 | Runner resolves secret | Decrypted value sent to target |
| H5 | Enc→dec roundtrip | Identical output |

## Error Cases
| ID | Scenario | Expected |
|---|---|---|
| X1 | SSRF: target = 10.0.0.5 | Blocked, safe error |
| X2 | SSRF: target = 169.254.169.254 | Blocked |
| X3 | CORS: disallowed origin (prod) | Preflight rejected |
| X4 | TLS verify fails (bad cert) | Error, not silently bypassed |
| X5 | SECRET_ENC_KEY unset in prod | Fail fast at startup |
| X6 | Any endpoint returns plaintext secret | MUST never happen |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | execute-direct to allowed host | Unchanged response shape |
| R2 | ws-proxy to allowed target | Relay works |
| R3 | Non-secret vars | Plaintext, searchable, unchanged |
