# Test Matrix — Platform Hardening

LAST_UPDATED: 2026-06-15

## Happy Path (must work)
| ID | Scenario | Input | Expected | Notes |
|---|---|---|---|---|
| H1 | Alembic up then down | clean test DB | both succeed, schema matches | reversible |
| H2 | Baseline stamp | DB with current tables | `alembic current` = head, no recreate | idempotent |
| H3 | Outbound to valid TLS host | https public api | request succeeds, verify=True | default secure |
| H4 | Logger emits structured line | trigger error path | line in log file, no secret | reuse logs() |

## Edge Cases
| ID | Trap # | Scenario | Input | Expected | Why |
|---|---|---|---|---|---|
| E1 | 2 | localhost target, verify default | http://127.0.0.1 | works via per-request opt-out | self-host path |
| E2 | 3 | DNS rebinding host | host resolving to 169.254.169.254 | blocked after resolve | SSRF |
| E3 | 1 | re-run baseline | already stamped | no duplicate revision | safety |

## Error Cases
| ID | Scenario | Expected Behavior |
|---|---|---|
| X1 | SSRF: target = 10.0.0.5 | blocked, safe error, audit/log |
| X2 | SSRF: target = metadata IP 169.254.169.254 | blocked |
| X3 | CORS: disallowed origin (prod) | preflight rejected |
| X4 | TLS verify fails (bad cert) | request errors, not silently bypassed |

## Regression (must not break)
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | execute-direct to allowed host | unchanged response shape |
| R2 | ws-proxy to allowed target | relay still works |
| R3 | scheduler runs due schedules | now with SKIP LOCKED, no double-run |
| R4 | all existing endpoints | auth + create_response unchanged |
