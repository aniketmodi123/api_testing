# Test Cases

Status: Existing
Coverage: 90%

## Implemented
- `ApiCase` model: `id, api_id(FK), name, headers(JSON), params(JSON), body(JSON), body_type, expected(JSON)`
- CRUD endpoints: save, delete, copy
- `AssertionBuilder` FE for `expected` field
- Test cases displayed in RequestPanel

## Missing
- Test case ordering (currently unordered within an API)
- Test case import from file (CSV/JSON)

## Current Task
None

## Next Task
Test case ordering (low priority)

## Priority
P2 (existing, stable)
