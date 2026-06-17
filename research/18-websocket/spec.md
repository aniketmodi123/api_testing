# Spec — WebSocket & Socket.IO

STATUS: updated
LAST_CHANGED: 2026-06-16

---

## Overview

Current APIPilot state: "WebSocket proxy works end-to-end. No new backend work needed."
That is a placeholder. The spec below covers the full feature set Postman ships.

Postman supports two distinct WebSocket-family request types:
1. **Raw WebSocket** — native WS/WSS protocol
2. **Socket.IO** — Socket.IO library protocol (event-based, multi-arg, with namespace/room concepts)

Both are saved to collections. Collections containing WS/Socket.IO requests **cannot** mix with
HTTP requests (Postman restriction APIPilot should match).

---

## Postman Feature Map

| Feature | Postman | APIPilot | Gap |
|---|---|---|---|
| Raw WebSocket request type | ✅ | partial | P1 |
| Socket.IO request type | ✅ | ❌ | P1 |
| Message log (sent + received, timestamped) | ✅ | ❌ | P1 |
| Message types: text, JSON, binary/ArrayBuffer | ✅ | ❌ | P1 |
| JSON/XML syntax highlight + auto-format in editor | ✅ | ❌ | P2 |
| Message search + filter | ✅ | ❌ | P2 |
| Save individual messages (named) | ✅ | ❌ | P2 |
| Save request to collection | ✅ | ❌ | P1 |
| Variables in URL + message body | ✅ | ❌ | P1 |
| Custom headers + handshake query params | ✅ | ❌ | P1 |
| WS-only collection constraint (no HTTP mix) | ✅ | ❌ | P2 |
| Socket.IO: event listeners panel | ✅ | ❌ | P1 |
| Socket.IO: multi-argument send | ✅ | ❌ | P2 |
| Socket.IO: acknowledgement (ack) | ✅ | ❌ | P2 |
| Socket.IO: color-coded event timeline | ✅ | ❌ | P3 |
| Socket.IO: event timing multi-select | ✅ | ❌ | P3 |
| Message history across sessions | ✅ | ❌ | P2 |
| Documentation from saved WS collection | ✅ | ❌ | P3 |
| Scripting / pre-request / post-response | ❌ (planned) | ❌ | defer |

---

## Backend

### DB Model Changes

#### `WebSocketSession` (new table)

Stores connection metadata and message log per session.

```
id              UUID PK
request_id      UUID FK → Request.id
workspace_id    UUID FK → Workspace.id
user_id         UUID FK → User.id
endpoint_url    VARCHAR NOT NULL
protocol        ENUM('raw', 'socketio') NOT NULL
status          ENUM('open','closed','error') NOT NULL DEFAULT 'open'
opened_at       TIMESTAMPTZ NOT NULL DEFAULT now()
closed_at       TIMESTAMPTZ
close_code      INTEGER                 -- WS close code (1000, 1001, etc.)
close_reason    VARCHAR
```

#### `WebSocketMessage` (new table)

```
id              UUID PK
session_id      UUID FK → WebSocketSession.id
direction       ENUM('sent','received') NOT NULL
format          ENUM('text','json','binary','hex') NOT NULL DEFAULT 'text'
content         TEXT                    -- text/JSON messages stored here
content_binary  BYTEA                   -- binary ArrayBuffer messages
event_name      VARCHAR                 -- Socket.IO only; NULL for raw WS
argument_index  INTEGER DEFAULT 0       -- Socket.IO multi-arg: 0, 1, 2...
sent_at         TIMESTAMPTZ NOT NULL DEFAULT now()
saved           BOOLEAN NOT NULL DEFAULT false
saved_name      VARCHAR                 -- user-given label when message saved
```

Index: `(session_id, sent_at)` for ordered log fetch.

#### `Request` model additions

New fields on existing `Request` table:

```
ws_protocol         ENUM('raw', 'socketio')   -- nullable; set when protocol = 'websocket'
ws_socketio_version VARCHAR                    -- '4', '3', '2'; nullable
ws_namespace        VARCHAR                    -- Socket.IO namespace, default '/'
ws_reconnect        BOOLEAN DEFAULT true
ws_reconnect_delay  INTEGER DEFAULT 1000       -- ms
```

### New Endpoints

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST | `/ws/connect` | viewer | Open WS/Socket.IO connection; return `session_id` |
| DELETE | `/ws/sessions/{session_id}` | viewer | Disconnect + close session |
| POST | `/ws/sessions/{session_id}/send` | viewer | Send message through open session |
| GET | `/ws/sessions/{session_id}/messages` | viewer | Fetch message log (paginated, cursor-based) |
| PATCH | `/ws/messages/{message_id}/save` | editor | Mark message as saved + set name |
| DELETE | `/ws/messages/{message_id}/save` | editor | Un-save a message |
| GET | `/ws/sessions` | viewer | List sessions for a request (history) |

#### POST `/ws/connect`

Request:
```json
{
  "request_id": "uuid",
  "endpoint_url": "wss://...",
  "protocol": "raw",
  "headers": {},
  "query_params": {},
  "ws_socketio_version": null,
  "ws_namespace": "/"
}
```

Response:
```json
{
  "session_id": "uuid",
  "status": "open",
  "opened_at": "2026-06-16T10:00:00Z"
}
```

APIPilot WS relay: server opens a real WS connection to `endpoint_url` on behalf of client.
Client receives messages via SSE stream on `GET /ws/sessions/{session_id}/stream` (EventSource).

#### POST `/ws/sessions/{session_id}/send`

Request:
```json
{
  "format": "json",
  "content": "{\"type\": \"ping\"}",
  "event_name": null,
  "arguments": []
}
```

For Socket.IO multi-arg:
```json
{
  "format": "json",
  "content": null,
  "event_name": "chat:message",
  "arguments": [
    { "format": "text", "content": "hello" },
    { "format": "json", "content": "{\"user\": \"alice\"}" }
  ]
}
```

#### GET `/ws/sessions/{session_id}/stream` (SSE)

Server-sent events stream pushing incoming WS messages to client in real time.
Event format:
```
event: message
data: {"id":"uuid","direction":"received","format":"json","content":"...","event_name":null,"sent_at":"..."}
```

```
event: close
data: {"code":1000,"reason":"Normal closure"}
```

### Business Logic

- Variable resolution (`{{var}}`) in `endpoint_url`, headers, query params, and message `content` before sending.
- Binary messages stored as base64 in `content`; `content_binary` holds raw bytes.
- Message log capped at 10,000 messages per session; oldest messages pruned when cap hit.
- Sessions older than 24 hours auto-closed by cleanup job.
- Socket.IO ack: if client sends `"ack": true`, relay waits for server ack and stores it as a `received` message with `event_name = "__ack__"`.

### Validation Rules

- `endpoint_url`: must start with `ws://` or `wss://`
- `format`: must be one of `text | json | binary | hex`
- `ws_socketio_version`: must be `'2' | '3' | '4'` if protocol is `socketio`
- `arguments`: max 10 items per send; max 1 MB total payload
- Message content: max 10 MB

### Modified Files

| File | Change |
|---|---|
| `models/websocket_session.py` | New ORM model |
| `models/websocket_message.py` | New ORM model |
| `models/request.py` | Add `ws_*` fields |
| `routers/websocket.py` | New file — all WS endpoints |
| `services/ws_relay.py` | WS relay logic: open connection, proxy messages, close |
| `services/ws_variable_resolver.py` | Resolve `{{vars}}` in URL + message body |
| `jobs/ws_cleanup.py` | Cron: close stale sessions, prune old message logs |
| `migrations/` | Create ws_session, ws_message tables; add ws_* cols to requests |

---

## Frontend

### Component Inventory

| Component | Location | Purpose |
|---|---|---|
| `WebSocketRequestPane` | `src/components/websocket/WebSocketRequestPane.tsx` | Top-level container; URL bar + Connect/Disconnect button |
| `WebSocketConfigTabs` | `src/components/websocket/WebSocketConfigTabs.tsx` | Tabs: Params / Headers / Settings |
| `WebSocketMessageEditor` | `src/components/websocket/WebSocketMessageEditor.tsx` | Compose outbound message; format selector |
| `WebSocketMessageLog` | `src/components/websocket/WebSocketMessageLog.tsx` | Virtualized list of sent/received messages |
| `WebSocketMessageRow` | `src/components/websocket/WebSocketMessageRow.tsx` | Single message row: direction badge, timestamp, preview, expand |
| `WebSocketMessageSearch` | `src/components/websocket/WebSocketMessageSearch.tsx` | Search + filter bar above message log |
| `SocketIOListenersPanel` | `src/components/websocket/SocketIOListenersPanel.tsx` | Socket.IO only: add/remove/toggle event listeners |
| `SocketIOArgumentEditor` | `src/components/websocket/SocketIOArgumentEditor.tsx` | Multi-arg send: add/remove argument slots |
| `WebSocketSessionHistory` | `src/components/websocket/WebSocketSessionHistory.tsx` | Past sessions list; reopen to view old log |
| `SaveMessageModal` | `src/components/websocket/SaveMessageModal.tsx` | Name + save an individual message |

### TypeScript Interfaces

```typescript
interface WebSocketRequestState {
  requestId: string;
  endpointUrl: string;
  protocol: 'raw' | 'socketio';
  socketioVersion: '2' | '3' | '4';
  namespace: string;
  headers: Array<{ key: string; value: string; enabled: boolean }>;
  queryParams: Array<{ key: string; value: string; enabled: boolean }>;
  sessionId: string | null;
  status: 'idle' | 'connecting' | 'open' | 'closed' | 'error';
  messages: WebSocketMessage[];
  searchQuery: string;
  filterDirection: 'all' | 'sent' | 'received';
  filterEventName: string;       // Socket.IO only
  activeListeners: SocketIOListener[];
  activeTab: 'params' | 'headers' | 'settings';
}

interface WebSocketMessage {
  id: string;
  direction: 'sent' | 'received';
  format: 'text' | 'json' | 'binary' | 'hex';
  content: string;
  eventName: string | null;      // Socket.IO only
  argumentIndex: number;
  sentAt: string;
  saved: boolean;
  savedName: string | null;
}

interface SocketIOListener {
  eventName: string;
  enabled: boolean;
}

interface SocketIOArgumentEditorProps {
  arguments: Array<{ format: 'text' | 'json' | 'binary'; content: string }>;
  onChange: (args: Array<{ format: string; content: string }>) => void;
}
```

### Component Render Descriptions

**`WebSocketRequestPane`**: URL bar at top with protocol selector (`ws://`/`wss://`) and Connect/Disconnect toggle button. Below: config tabs (Params/Headers/Settings). Below that: two-pane split — left = message composer + Socket.IO listeners panel; right = message log.

**`WebSocketMessageLog`**: Virtualized list (`react-virtual`). Each row shows: direction arrow (↑ sent / ↓ received), timestamp, event name badge (Socket.IO), content preview (truncated to 120 chars), expand chevron. Expanded row shows full content with syntax highlighting (CodeMirror 6 read-only, JSON mode). Hover shows Save icon.

**`WebSocketMessageSearch`**: Text input filters log by content substring. Direction toggle buttons (All / Sent / Received). Socket.IO mode adds event name filter dropdown (populated from seen event names).

**`SocketIOListenersPanel`**: "Listeners" header + "+" button. List of event name chips with enable/disable toggle and × remove. Only messages matching an enabled listener name appear in log (others silently dropped client-side).

**`WebSocketMessageEditor`**: Format selector dropdown (Text / JSON / Binary / Hex). CodeMirror 6 editor for content. JSON format: auto-format button + syntax validation. Binary: hex input. "Send" button. For Socket.IO: event name input field above editor + `SocketIOArgumentEditor` for multi-arg.

**`WebSocketSessionHistory`**: Drawer/panel listing past sessions (endpoint, opened_at, message count, duration). Click to load read-only message log from that session.

### API Calls

| Action | Method | URL | When |
|---|---|---|---|
| Connect | POST | `/ws/connect` | Connect button clicked |
| Disconnect | DELETE | `/ws/sessions/{id}` | Disconnect button / tab close |
| Send message | POST | `/ws/sessions/{id}/send` | Send button clicked |
| Stream messages | GET (SSE) | `/ws/sessions/{id}/stream` | After connect; EventSource kept open |
| Load log page | GET | `/ws/sessions/{id}/messages?cursor=&limit=50` | On scroll up (load older) |
| Save message | PATCH | `/ws/messages/{id}/save` | Save icon clicked |
| Load history | GET | `/ws/sessions?request_id=` | Session history panel open |

### Library Decisions

| Decision | Choice | Reason |
|---|---|---|
| Message log virtualization | `react-virtual` | Logs can hit thousands of messages; DOM must stay bounded |
| Message editor | CodeMirror 6 | Already used for scripts + GraphQL; consistent |
| Incoming message push | SSE (`EventSource`) | Same relay pattern as SSE feature; no separate WS-to-client connection needed |
| Socket.IO relay | `socket.io-client` on server | Must speak Socket.IO protocol to target; raw WS won't handshake correctly |

---

## Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | WS-only collections | Enforce same constraint as Postman | Avoids runner complexity of mixed-protocol collections |
| 2 | Message delivery to browser | SSE relay (not WS-to-browser) | Simpler; SSE already built; no upgrade negotiation needed for push |
| 3 | Socket.IO relay library | `socket.io-client` on server | Postman uses same approach; raw WS can't speak Socket.IO handshake |
| 4 | Binary storage | Base64 in TEXT column | Avoids BYTEA query complexity; binary messages are rare and small |
| 5 | Message log cap | 10,000 messages per session | Prevents unbounded DB growth; old messages pruned FIFO |
| 6 | Scripting support | Deferred | Postman itself hasn't shipped it yet; defer to avoid spec instability |

---

## Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | WS connection drops mid-session | Detect in relay; emit `close` SSE event; update session status to `error`; show reconnect button |
| 2 | Target server rejects handshake (403/401) | Relay returns HTTP error before upgrade; surface as connect error with status code |
| 3 | Socket.IO version mismatch | Relay fails to handshake; show "Socket.IO version mismatch" error with selected version |
| 4 | Message log > 10,000 items | Prune oldest on insert; show "Oldest messages pruned" banner in log |
| 5 | Variable `{{var}}` in URL not resolved | Show unresolved warning badge on URL bar; block connect |
| 6 | Binary message displayed as garbled text | Auto-detect binary frames; switch display to hex view |
| 7 | Reconnect on tab reload | `session_id` stored in component state; on reload, open new session (not resume old) |
| 8 | Socket.IO listener not added before message arrives | Messages with no matching listener shown in log with "unlistened" grey badge; not dropped |

---

## Deferred

| Item | Reason |
|---|---|
| Scripting / pre-connect / on-message scripts | Postman itself hasn't shipped; spec unstable |
| Collection runner for WS requests | Complex ordering logic; P3 |
| Socket.IO rooms / namespaces UI | Namespace field exists; room management deferred |
| Message export (JSON/CSV) | P3 nice-to-have |
| WS subprotocol header (`Sec-WebSocket-Protocol`) | Niche; add on request |
| gRPC streaming (separate protocol) | Different spec |
