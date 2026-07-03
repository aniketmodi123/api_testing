# Research — SSE

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_12_protocols/spec.md

## Existing Code
| File | Purpose |
|---|---|
| `backend/src/routers/runner/sse_proxy.py` | GET /api/sse-proxy — SSE streaming proxy |
| `backend/src/ssrf.py` | SSRF guard before connecting |

## Implementation Pattern
```python
# sse_proxy.py:
# Uses httpx async streaming: async with client.stream("GET", target_url) as resp:
#   async for line in resp.aiter_lines():
#       yield f"data: {line}\n\n"
# Returns StreamingResponse(media_type="text/event-stream")
```

## Known Constraint
Browser native `EventSource` API cannot set custom headers (JWT auth won't work).
Frontend must use `fetch()` with `ReadableStream`, or pass JWT token as query param.
Token-as-query-param is a known security tradeoff — document for FE team.
