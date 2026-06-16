# Spec — SSE

STATUS: in-progress (backend done; FE missing)
LAST_CHANGED: 2026-06-16
SOURCE: phases/phase_12_protocols/spec.md

## Goal
Server-Sent Events streaming proxy — connect to SSE endpoint, relay events to browser.

## Backend (shipped)
```
GET /api/sse-proxy?target_url=<url>
  Auth: JWT (standard)
  SSRF: assert_safe_url() called before connecting
  Response: StreamingResponse(media_type="text/event-stream")
  Error: 400 { error_message: "<ssrf reason>" }
```

## Frontend (missing)
SSEPanel — connect button, event stream display, disconnect.

## Auth Note
Browser `EventSource` API cannot set custom headers → FE must use `fetch()` + `ReadableStream`, or pass token as query param. Token-as-query-param is a known tradeoff.
