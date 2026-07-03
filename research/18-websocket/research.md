# Research — WebSocket

LAST_UPDATED: 2026-06-16

## Existing Code
| File | Purpose |
|---|---|
| `backend/src/routers/runner/ws_proxy.py` | WebSocket proxy — relay client↔target |
| `backend/src/ssrf.py` | `assert_safe_url()` — called before `websockets.connect()` |

## Proxy Pattern
```python
# ws_proxy.py pattern (template for SSE proxy):
async def ws_proxy(target_url, websocket):
    assert_safe_url(target_url)
    async with websockets.connect(target_url) as ws:
        # bidirectional relay: client → ws, ws → client
```
