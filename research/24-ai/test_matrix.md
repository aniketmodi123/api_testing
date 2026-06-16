# Test Matrix — AI (Test Case Generation)

LAST_UPDATED: 2026-06-16

## Status
Dropped from scope. Matrix to be written when/if re-scoped.

## Key Tests When Implemented
| ID | Scenario | Expected |
|---|---|---|
| H1 | Generate cases from endpoint | Valid ApiCase schema returned |
| H2 | User approves | Cases persisted |
| H3 | User rejects | Nothing persisted |
| X1 | API key missing | Startup error or 503 |
| X2 | Generated case references secret | Secret not included in generation output |
