# Research — Response Viewer

LAST_UPDATED: 2026-06-16

## Existing Code
| File | Purpose |
|---|---|
| `frontend/src/components/RequestPanel/RequestPanel.jsx` | Response display: status, body, headers, time |
| `backend/src/models.py` | `RequestHistory`: `id, node_id(FK nullable), method, url, headers(JSON), body(JSON), response(JSON), created_at` |
| `backend/src/routers/runner/execute_direct.py` | Persists to RequestHistory after each send |

## RequestHistory.response Shape
```json
{
  "status_code": 200,
  "body": {},
  "headers": {"content-type": "application/json"},
  "duration_ms": 145
}
```
