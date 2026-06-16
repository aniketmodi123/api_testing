# Test Matrix — SSRF Protection

LAST_UPDATED: 2026-06-16

## Error Cases (all must be blocked)
| ID | Input | Expected |
|---|---|---|
| X1 | 10.0.0.5 (private RFC1918) | Blocked |
| X2 | 172.16.0.1 (private RFC1918) | Blocked |
| X3 | 192.168.1.1 (private RFC1918) | Blocked |
| X4 | 169.254.169.254 (metadata) | Blocked |
| X5 | 127.0.0.1 (loopback) | Blocked |
| X6 | Host that resolves to private IP (DNS rebinding) | Blocked after resolve |
| X7 | SSRF_ALLOWLIST override | Allowed |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | execute-direct to public host | Unchanged |
| R2 | OAuth token fetch to public token_url | Unchanged |
