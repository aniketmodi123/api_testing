# Research — Testing (Assertions + Validation)

LAST_UPDATED: 2026-06-16

## Existing Code
| File | Purpose |
|---|---|
| `backend/src/routers/runner/validator.py` | Response assertion engine; jsonschema validation |
| `backend/src/models.py` | `ApiCase.expected` JSON field — stores expected {status_code, body, headers} |
| `frontend/src/components/RequestPanel/` | `AssertionBuilder` FE component |

## validator.py Capabilities
- Status code match
- Body key/value assertions
- Header assertions
- jsonschema body validation (`_jsonschema_available` flag)
- Returns `{passed, failed, assertions:[{key,expected,actual,pass}]}`

## What's Missing
- JS sandbox for pre/post request scripts (would require `deno` or `quickjs` subprocess — heavy)
- Contract testing uses `validator.py` + `jsonschema` but needs OpenAPI spec as input (20-openapi-specs)
