# Assertions

Status: Existing
Coverage: 85%

## Implemented
- `ApiCase.expected` JSON schema: `{status_code, body, headers}`
- `AssertionBuilder` FE component
- `validator.py` — assertion engine: status code, body key/value, jsonschema validation
- Results stored in `BulkTestResult.assertions`

## Missing
- Pre-request / post-request assertion scripts (out of scope)
- Assertion on response time (latency threshold)

## Current Task
None

## Next Task
Latency threshold assertion (low priority)

## Dependencies
- 09-collection-runner (assertions run inside runner)
- 08-testing (same feature domain)

## Priority
P2 (existing, stable)
