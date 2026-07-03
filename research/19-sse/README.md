# 19 — SSE (Server-Sent Events)

Status: Partial
Coverage: 60%

## Implemented (backend)
- SSE proxy: `GET /api/sse-proxy?target_url=<url>`
- `StreamingResponse(media_type="text/event-stream")`
- SSRF guard on target URL

## Missing
- FE SSEPanel (stream viewer)
- Auth note: browser `EventSource` can't set custom headers; FE must use `fetch()` + `ReadableStream` or token-as-query-param

## Current Task
None (backend done)

## Next Task
FE SSEPanel

## Dependencies
- 22-security (SSRF guard — done)

## Priority
P2
