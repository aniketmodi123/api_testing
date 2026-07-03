# 08 — Testing (Assertions + Validation)

Status: Partial
Coverage: 65%

## Implemented
- `ApiCase.expected` schema — expected status, body, headers assertions
- `AssertionBuilder` FE component
- `validator.py` — response validation engine
- Schema validation (jsonschema library present)
- Response vs expected assertion checks

## Missing
- Test scripts (JS sandbox — `pm.*` style) — no JS execution
- Contract testing (response vs OpenAPI schema) — in 09-collection-runner / spec feature
- Pre-request scripts

## Current Task
None

## Next Task
Contract testing endpoints (depends on 20-openapi-specs feature)

## Dependencies
- 20-openapi-specs (for contract testing)
- 09-collection-runner (test results displayed there)

## Priority
P2
