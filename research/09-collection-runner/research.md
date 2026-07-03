# Research — Collection Runner

LAST_UPDATED: 2026-06-16

## Existing Code
| File | Purpose |
|---|---|
| `backend/src/routers/runner/bulk_run_cases.py` | Multi-case async execution loop |
| `backend/src/routers/runner/run_case.py` | Single case run + assertion |
| `backend/src/routers/runner/runner.py` | Scheduler-triggered execution path |
| `backend/src/models.py` | `BulkTestSchedule`, `BulkTestExecution`, `BulkTestResult`, `ScheduleAlert` |
| `frontend/src/components/` | `BulkTestPanel`, `BulkResults` modal |

## BulkTestResult Shape
```
BulkTestResult
  id
  execution_id    FK → bulk_test_executions
  case_id         FK → api_cases
  success         bool
  request         JSON  {method, url, headers, body}
  response        JSON  {status_code, body, headers, duration_ms}
  assertions      JSON  [{key, expected, actual, pass}]
  created_at      datetime
```

## Execution Loop Pattern (bulk_run_cases.py)
```python
# For each case in ordered list:
#   resolve vars + auth
#   send via execute_direct
#   run assertions via validator
#   persist BulkTestResult
#   update BulkTestExecution.status
```
This pattern is the template for the Flow engine (10-workflows).
