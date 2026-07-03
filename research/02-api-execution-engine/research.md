# Research — API Execution Engine

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_0_platform_hardening/research.md

## Existing Code
| File | Purpose |
|---|---|
| `backend/src/routers/runner/execute_direct.py` | Single request send; assembles headers, body, auth, calls httpx |
| `backend/src/http_client.py` | `get_http_client()` singleton AsyncClient; pooled, TLS flag, timeout |
| `backend/src/ssrf.py` | SSRF guard before every outbound send |
| `backend/src/auth_strategies.py` | Auth injection (called from execute_direct) |
| `backend/src/utils.py` | `resolve_variables()` — called before send |

## execute_direct Flow
```python
# execute_direct.py:
# 1. Resolve variables in URL, headers, body
# 2. resolve_auth(file_id) → get auth config
# 3. apply_auth_async(request, auth_config) → inject headers/params
# 4. assert_safe_url(final_url)  ← SSRF guard
# 5. client = get_http_client()
# 6. response = await client.request(method, url, headers=..., ...)
# 7. persist RequestHistory
# 8. return response snapshot
```

## Needed: Extract send_request()
The engine (10-workflows) needs a shared callable. Refactor execute_direct to extract:
```python
async def send_request(method, url, headers, body, body_type, timeout) -> ResponseSnapshot:
    assert_safe_url(url)
    client = get_http_client()
    resp = await client.request(...)
    return ResponseSnapshot(status_code, body, headers, duration_ms)
```
Handler calls `send_request()` then persists history. Flow engine also calls `send_request()`.
