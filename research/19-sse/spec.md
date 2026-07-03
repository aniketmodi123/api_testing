# Spec — Server-Sent Events (SSE)

STATUS: Research complete
LAST_CHANGED: 2026-06-16
SOURCE: learning.postman.com/docs/use/send-requests/response-data/responses + blog.postman.com/support-for-server-sent-events + community.postman.com/t/sse-events-in-postman

---

## Goal

Provide a native SSE client: send an HTTP GET request, auto-detect `text/event-stream` response, display streaming events in a real-time list with search/filter/clear, and allow the user to disconnect mid-stream.

---

## 1. Feature Overview

**Postman behavior:** SSE requires zero extra config. Send a standard HTTP GET to any SSE endpoint. Postman detects `Content-Type: text/event-stream` and switches the response panel to SSE event list mode automatically.

**APIPilot target:** Identical behavior — no "SSE mode" toggle needed. Detection is automatic on response `Content-Type`.

**No proxy needed:** The browser's native `EventSource` API is used directly. A proxy endpoint (`/sse-proxy`) is NOT required and should be removed from the plan — it would duplicate the browser's built-in capability and adds latency.

---

## 2. Backend Specification

### 2.1 What Backend Does

The backend does **not** handle SSE connections on behalf of the user. The frontend connects to the target SSE URL directly using the browser's `EventSource` API.

The only backend involvement:

| Concern | How Handled |
|---|---|
| CORS on target server | User's problem (or APIPilot desktop app bypasses CORS) |
| Saving SSE sessions | Store SSE request config in the Request model (same as HTTP) |
| Persisting captured events | Not persisted — events are transient per-session in FE state |
| Auth headers on SSE request | `EventSource` native API does not support custom headers; use query-param token or desktop app interceptor |

### 2.2 Auth Header Problem (Critical Edge Case)

Browser `EventSource` API does **not** support custom headers. Solutions:
1. **Desktop app (Electron):** Use `node-eventsource` or custom net module — supports headers.
2. **Web app fallback:** Pass auth as a query parameter (e.g. `?token=...`). User must configure this manually.
3. **APIPilot choice:** In web mode, show a warning banner: "Custom headers not supported for SSE in browser mode. Use token query parameter or desktop app."

### 2.3 `/sse-proxy` Endpoint — REMOVE

The previously specced `GET /sse-proxy` backend endpoint is incorrect. Postman does not use a server-side proxy for SSE. Remove this endpoint from APIPilot's backend plan.

---

## 3. Frontend Specification

### 3.1 Library Decisions

| Decision | Choice | Reason |
|---|---|---|
| SSE connection | Native browser `EventSource` | Built into all modern browsers; no library overhead |
| SSE with headers (desktop) | `eventsource` npm package (Node.js) | Supports custom headers in Electron/desktop context where `EventSource` native API does not |
| JSON formatting | `react-json-view` or inline pretty-print | SSE `data` fields are often JSON; auto-detect and render formatted |
| Virtual list for events | `react-virtual` (TanStack) | Events accumulate rapidly; DOM must not blow up; virtualize the event list |

### 3.2 Component Inventory

| Component | Location | Purpose |
|---|---|---|
| `SSEPanel` | `components/sse/SSEPanel.tsx` | Main layout: URL bar + headers (read-only warning if web), connect/disconnect button, event list |
| `SSEConnectBar` | `components/sse/SSEConnectBar.tsx` | URL input (inherited from request), Connect/Disconnect button, connection status badge |
| `SSEEventList` | `components/sse/SSEEventList.tsx` | Virtualized auto-scrolling list of `SSEEventItem` rows |
| `SSEEventItem` | `components/sse/SSEEventItem.tsx` | One event row: index, event type, event id, data (formatted), timestamp |
| `SSEToolbar` | `components/sse/SSEToolbar.tsx` | Search input, filter by event type, Clear Events button, Save Response button |
| `SSEStatusBadge` | `components/sse/SSEStatusBadge.tsx` | Dot indicator: grey=closed, yellow=connecting, green=open, red=error |

### 3.3 TypeScript Interfaces

```typescript
interface SSEEvent {
  index: number;           // sequential event number (1-based)
  eventType: string;       // SSE `event:` field; defaults to "message" if absent
  eventId: string | null;  // SSE `id:` field
  data: string;            // raw data string
  dataParsed: unknown | null;  // JSON.parse(data) result; null if parse fails
  retry: number | null;    // SSE `retry:` field in ms; null if not sent
  receivedAt: number;      // Date.now() when event arrived
}

type SSEConnectionStatus = 'closed' | 'connecting' | 'open' | 'error';

interface SSEPanelProps {
  requestId: string;
  url: string;
  headers: Record<string, string>;
}

interface SSEToolbarProps {
  searchQuery: string;
  filterEventType: string;
  onSearchChange: (q: string) => void;
  onFilterChange: (type: string) => void;
  onClear: () => void;
  onSave: () => void;
  eventTypes: string[];   // distinct event types seen so far
}

interface SSEEventItemProps {
  event: SSEEvent;
  isExpanded: boolean;
  onToggle: () => void;
}
```

### 3.4 Component Render Descriptions

**`SSEPanel`**
- Rendered when request type is HTTP GET **and** response `Content-Type` contains `text/event-stream`.
- For non-SSE responses, renders normal HTTP response panel — SSE panel is not shown.
- On mount: does NOT auto-connect. User must press Connect.
- Passes URL + headers to `SSEConnectBar`.
- On Connect: creates `EventSource` (native or npm based on context), registers `onmessage`, `onerror`, custom event listeners.
- On Disconnect: calls `eventSource.close()`.

**`SSEConnectBar`**
- URL field is read-only (inherits from request URL bar above).
- Button label: "Connect" when `closed/error`; "Disconnect" when `connecting/open`.
- `SSEStatusBadge` beside button.
- If web context + custom auth headers present: shows yellow warning "Custom headers unsupported in browser SSE mode."

**`SSEEventList`**
- Virtualized with `react-virtual` (window of ~20 rows rendered).
- Auto-scrolls to bottom when new events arrive, unless user has manually scrolled up (scroll-lock detection).
- "Scroll to bottom" floating button appears when scroll-locked.
- Filtered by `searchQuery` (substring match on `data` + `eventType`) and `filterEventType`.

**`SSEEventItem`**
- Collapsed by default: shows `#index`, `eventType` badge, first 80 chars of `data`, relative timestamp.
- Expanded: shows all fields — `id`, `event`, full `data`, `retry`, `receivedAt` formatted as `HH:mm:ss.SSS`.
- If `dataParsed` is not null: renders formatted JSON in a code block with syntax highlighting.
- If `dataParsed` is null: renders raw string in `<pre>`.

**`SSEToolbar`**
- Search: real-time filter as user types (debounce 150ms).
- Event type filter: dropdown populated with distinct `eventType` values seen so far; "All" option.
- Clear: empties event list in state, resets index counter.
- Save Response: serialises all events to JSON array and triggers download as `.json`.

### 3.5 Auto-Detection Logic

```typescript
// In the response handler, after headers received:
const contentType = response.headers.get('Content-Type') ?? '';
const isSSE = contentType.includes('text/event-stream');

if (isSSE) {
  // Switch response panel to SSEPanel
  setResponseMode('sse');
} else {
  setResponseMode('http');
}
```

### 3.6 SSE Reconnection Behavior

SSE spec: browser automatically reconnects after connection drop using `retry` interval (default 3s if not sent by server).

APIPilot behavior:
- Let native `EventSource` handle reconnection automatically.
- Show `SSEStatusBadge` as `connecting` during reconnect attempt.
- Display reconnection attempt count in `SSEConnectBar`: "Reconnecting... (attempt 3)".
- User can click Disconnect to stop reconnect loop.

### 3.7 API Calls Table

| Action | Method | URL | Trigger |
|---|---|---|---|
| Load/save request config | (existing HTTP request endpoints) | — | Same as any HTTP request |
| SSE connection | Native `EventSource` | User's target URL (direct) | Connect button |
| No backend SSE proxy | — | — | Removed from plan |

### 3.8 State Shape

```typescript
interface SSEState {
  // Per-request SSE session (keyed by requestId)
  sessions: Record<string, {
    status: SSEConnectionStatus;
    events: SSEEvent[];
    reconnectAttempts: number;
    searchQuery: string;
    filterEventType: string;
    scrollLocked: boolean;   // user scrolled up
  }>;
}
```

---

## 4. Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Backend proxy | Removed | Postman uses direct `EventSource`; proxy adds latency + complexity for no gain |
| 2 | Auto-detect SSE | Content-Type header check | Postman behavior: no explicit SSE mode; automatic on `text/event-stream` |
| 3 | Virtual list | `react-virtual` | SSE streams can produce hundreds of events/second; DOM must be virtualized |
| 4 | Event persistence | In-memory only per session | Events are transient; persisting to DB has no user value and is expensive |
| 5 | Custom headers in web | Warning banner + query-param workaround | Browser `EventSource` hard limitation; desktop app uses `eventsource` npm package |
| 6 | Reconnection | Let native EventSource handle | Spec-compliant behavior; `retry` field from server controls interval |
| 7 | Save response | Download as JSON array | Matches Postman "save response" behavior; simple and useful for debugging |
| 8 | Scroll lock | Auto-scroll unless user scrolled up | Standard streaming UI pattern; prevents janky scroll hijack |

---

## 5. Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | `Content-Type: text/event-stream; charset=utf-8` (with charset) | `contentType.includes('text/event-stream')` handles this — substring match not exact match |
| 2 | Server sends malformed SSE (missing `data:` prefix) | Discard malformed message; log in console; do not crash event list |
| 3 | Rapid event bursts (1000+/sec) | Virtualized list + batch state update (group events in 50ms flush window using `requestAnimationFrame`) |
| 4 | `data` field is multi-line (SSE spec allows it) | Concatenate multi-line `data:` fields with `\n` before parsing |
| 5 | First event missed on fast servers | Known Postman issue (#13537); accept limitation — fast servers may send first event before `onmessage` registered |
| 6 | EventSource connection on HTTP (non-HTTPS) target | Allow in desktop app; warn in web app (mixed content policy) |
| 7 | Named events (custom `event:` type) vs default messages | Register both `eventSource.onmessage` (default) and `addEventListener(type, ...)` for each distinct event type seen |

---

## 6. Deferred

| Item | Reason |
|---|---|
| `pm.sendRequest` SSE support (in test scripts) | Native `EventSource` not available in test sandbox; complex to implement |
| SSE server mode (APIPilot as SSE server) | Out of scope — client testing tool only |
| Event replay (rerun captured events) | No user demand signal |
| SSE over HTTP/2 (server push) | Different protocol; separate feature if needed |
