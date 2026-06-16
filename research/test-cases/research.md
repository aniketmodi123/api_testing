# Research — Test Cases

LAST_UPDATED: 2026-06-16

## Existing Code
| File | Purpose |
|---|---|
| `backend/src/models.py` | `ApiCase`: `id, api_id(FK→apis CASCADE), name, headers(JSON), params(JSON), body(JSON), body_type, expected(JSON)` |
| `backend/src/routers/api_cases/save_api_case.py` | Create/update case |
| `backend/src/routers/api_cases/delete_case.py` | Delete case |
