# Research — Assertions

LAST_UPDATED: 2026-06-16

## Existing Code
See 08-testing/research.md — assertions are part of the testing feature.

## validator.py Assertion Output
```json
{
  "passed": 2,
  "failed": 1,
  "assertions": [
    {"key": "status_code", "expected": 200, "actual": 404, "pass": false},
    {"key": "body.name", "expected": "Alice", "actual": "Alice", "pass": true}
  ]
}
```
