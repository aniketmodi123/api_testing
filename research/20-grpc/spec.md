# Spec — gRPC

STATUS: updated (REDO complete)
LAST_CHANGED: 2026-06-17

---

## 1. Feature Overview

gRPC support lets users invoke gRPC methods (all 4 types) against a gRPC server using a `.proto` file or server reflection. Postman ships full gRPC parity — APIPilot targets the same feature set.

**Status:** Not started. Gated on confirmed user demand (original decision stands). This spec is complete enough to implement when demand is confirmed.

**Postman gRPC supports:**
- All 4 method types: Unary, Server Streaming, Client Streaming, Bidirectional Streaming
- Service definitions via: `.proto` file upload OR server reflection
- Multi-file proto (automatic dependency resolution)
- Metadata key-value pairs
- Auth (API Key, Basic, Bearer, OAuth2)
- Pre-invoke + after-response scripts (`pm.*`)
- Streaming timeline (unified event log)
- TLS toggle per-request
- Save as Example
- Mock gRPC servers (deferred)

---

## 2. DB Models

### ProtoFile (NEW)
```
ProtoFile
  id              UUID PK
  workspace_id    FK → Workspace (or file_id FK → File)
  name            varchar(255)    e.g. "greeter.proto"
  content         text            raw .proto file content
  created_at      datetime
  updated_at      datetime
```

### GrpcRequest (NEW — or extend existing Api model with type discriminator)
```
GrpcRequest
  id              UUID PK
  node_id         FK → Node CASCADE DELETE
  name            varchar(255)
  server_url      varchar(500)    e.g. "grpc.example.com:443"
  tls_enabled     bool default true
  service         varchar(255)    e.g. "helloworld.Greeter"
  method          varchar(255)    e.g. "SayHello"
  method_type     enum            unary | server_streaming | client_streaming | bidi_streaming
  proto_file_id   FK → ProtoFile nullable   null if using server reflection
  message         JSON            default message payload (JSON object)
  metadata        JSON            [{key, value, enabled}]
  auth            JSON            same shape as Http Request auth config
  pre_invoke_script   text nullable
  post_response_script text nullable
  settings        JSON            {tls_verify: bool, max_msg_size: int, timeout_ms: int}
```

---

## 3. Backend Endpoints

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST | `/grpc/proto` | user | Upload proto file; returns ProtoFile id |
| GET | `/grpc/proto` | user | List proto files in workspace |
| DELETE | `/grpc/proto/{id}` | user | Delete proto file |
| POST | `/grpc/reflect` | user | Trigger server reflection; returns service+method list |
| POST | `/grpc/invoke` | user | Invoke unary gRPC method |
| GET | `/grpc/stream/{session_id}` | user | SSE stream for server/bidi streaming responses |
| POST | `/grpc/stream/{session_id}/send` | user | Send message in client/bidi streaming |
| POST | `/grpc/stream/{session_id}/end` | user | End client-side stream |
| POST | `/grpc/request` | user | Save GrpcRequest to collection |
| GET | `/grpc/request/{id}` | user | Get saved GrpcRequest |
| PATCH | `/grpc/request/{id}` | user | Update saved GrpcRequest |

### POST /grpc/reflect — Request / Response
```
Request:
  server_url: str     e.g. "grpc.example.com:443"
  tls_enabled: bool

Response:
  services: [
    {
      name: str,    e.g. "helloworld.Greeter"
      methods: [
        { name: str, method_type: "unary|server_streaming|client_streaming|bidi_streaming",
          input_type: str, output_type: str }
      ]
    }
  ]
```

### POST /grpc/invoke — Request / Response (Unary)
```
Request:
  server_url: str
  service: str
  method: str
  message: JSON object
  metadata: [{key, value}]
  proto_file_id: str | null
  tls_enabled: bool
  timeout_ms: int

Response:
  result: JSON object     deserialized response message
  metadata: [{key, value}]
  trailers: [{key, value}]
  status_code: int         gRPC status code (0 = OK)
  status_message: str
  duration_ms: int
```

### POST /grpc/invoke (Streaming — Server / Client / Bidi)
For streaming methods, `POST /grpc/invoke` returns a `session_id` immediately. Caller subscribes to `GET /grpc/stream/{session_id}` SSE to receive streamed messages. For client-side streaming, caller sends messages via `POST /grpc/stream/{session_id}/send`.

---

## 4. Backend Implementation

### Python Library: `grpcio` + `grpcio-tools` + `grpc-reflection`

```
grpcio              ~50 MB Docker image addition — acceptable for gRPC feature
grpcio-tools        proto compilation
grpcio-reflection   server reflection client
protobuf            message serialization
```

### Proto Loading Flow
```
If proto_file_id provided:
  1. Load ProtoFile.content from DB
  2. Write to temp dir
  3. Compile with grpc_tools.protoc → descriptor pool
  4. Build dynamic stub from descriptor

If server reflection:
  1. Connect to gRPC server
  2. Call ServerReflection stub
  3. Get FileDescriptorProto for each service
  4. Build descriptor pool from reflection data
```

### Unary Invoke Flow
```python
# backend/src/routers/grpc/invoke.py

async def invoke_unary(req: GrpcInvokeRequest) -> GrpcResponse:
    assert_safe_url(f"https://{req.server_url}")   # SSRF guard — use https:// for IP check
    channel = grpc.aio.secure_channel(req.server_url, creds) if req.tls_enabled \
              else grpc.aio.insecure_channel(req.server_url)
    stub = build_dynamic_stub(channel, req.service, descriptor_pool)
    method_fn = getattr(stub, req.method)
    request_msg = json_to_proto_message(req.message, input_descriptor)
    response = await method_fn(request_msg, metadata=req.metadata, timeout=req.timeout_ms/1000)
    return GrpcResponse(result=proto_message_to_json(response), ...)
```

### Streaming via SSE
Server streaming: open gRPC call → async iterate messages → emit each as SSE event `data: {msg}`.
Client streaming: hold open session dict → accept POST /send → feed into request_iterator.
Bidi: combine both patterns.

Session store: in-memory dict `{session_id: GrpcStreamSession}` (acceptable for v1; Redis for scale).

### File: `backend/src/routers/grpc/`
```
grpc/
  __init__.py
  invoke.py        unary + streaming invoke
  reflect.py       server reflection
  proto_loader.py  proto file compile + descriptor pool
  stream_session.py  session state for streaming
  router.py        FastAPI router wiring
```

---

## 5. Frontend Components

### 5.1 Component Inventory

| Component | Location | Purpose |
|---|---|---|
| `GrpcRequestPanel` | `frontend/src/components/GrpcRequestPanel/` | Root gRPC request UI |
| `GrpcUrlBar` | inside GrpcRequestPanel | Server URL input + TLS toggle + Invoke/Send button |
| `ServiceMethodSelector` | inside GrpcRequestPanel | Service dropdown → Method dropdown (populated from reflection or proto) |
| `ServiceDefinitionPanel` | inside GrpcRequestPanel | Proto file selector or "Use Server Reflection" toggle |
| `GrpcMessageTab` | inside GrpcRequestPanel | JSON message editor (CodeMirror) with auto-example generation |
| `GrpcMetadataTab` | inside GrpcRequestPanel | Key-value metadata table |
| `GrpcAuthTab` | inside GrpcRequestPanel | Same auth component as HTTP request (reuse AuthTab) |
| `GrpcScriptsTab` | inside GrpcRequestPanel | Pre-invoke + after-response JS editors |
| `GrpcSettingsTab` | inside GrpcRequestPanel | TLS verify toggle, max message size, timeout |
| `GrpcStreamingTimeline` | inside GrpcRequestPanel | Chronological event log (sent/received messages) |
| `GrpcResponsePanel` | inside GrpcRequestPanel | Unary response display (result JSON + status + trailers) |
| `ProtoFileManager` | `frontend/src/components/ProtoFileManager/` | Upload / list / delete proto files |

### 5.2 TypeScript Interfaces

```typescript
type GrpcMethodType = "unary" | "server_streaming" | "client_streaming" | "bidi_streaming";

interface GrpcService {
  name: string;
  methods: GrpcMethod[];
}

interface GrpcMethod {
  name: string;
  method_type: GrpcMethodType;
  input_type: string;
  output_type: string;
}

interface GrpcStreamEvent {
  id: string;
  direction: "sent" | "received" | "status";
  timestamp: string;
  message: object | null;
  status_code?: number;
  status_message?: string;
}

interface GrpcRequestPanelProps {
  requestId: string | null;   // null = new unsaved request
  onSave: (req: GrpcRequest) => void;
}
```

### 5.3 Render Descriptions

**GrpcUrlBar** — URL input (e.g. `grpc.example.com:443`), TLS lock icon toggle (green=on, grey=off). Right: Invoke button (changes to "Cancel" when streaming active). For client/bidi: shows "Send Message" button alongside.

**ServiceDefinitionPanel** — toggle: "Server Reflection" | "Proto File". Reflection mode: auto-loads on URL entry (calls POST /grpc/reflect). Proto mode: dropdown of workspace ProtoFiles + "Upload New..." option. After loading: populates ServiceMethodSelector.

**ServiceMethodSelector** — two chained dropdowns: Service (e.g. `helloworld.Greeter`) → Method (e.g. `SayHello [Unary]`). Method label includes type badge.

**GrpcMessageTab** — CodeMirror JSON editor. "Generate Example" button → auto-populates from proto descriptor field definitions. Supports variables `{{var}}` with highlighting.

**GrpcStreamingTimeline** — visible for non-unary methods once invoked. Vertical event list:
- Sent message: right-aligned, blue
- Received message: left-aligned, green
- Status event: center, grey
- Filter bar: All / Sent / Received
- Search: text search across messages
- Expand/collapse per message
- "Clear" button

**GrpcResponsePanel** — visible for unary only. Shows: Result (JSON pretty view), Metadata, Trailers, Status Code + Message (0 OK green, non-zero red), Duration.

---

## 6. Streaming Session State

```python
@dataclass
class GrpcStreamSession:
    session_id: str
    method_type: GrpcMethodType
    channel: grpc.aio.Channel
    call: Any                     # active gRPC call object
    message_queue: asyncio.Queue  # for client-streaming sends
    created_at: datetime
    last_activity: datetime

# Cleanup: sessions idle > 5 min auto-closed
```

---

## 7. gRPC Status Codes

| Code | Name | Meaning |
|---|---|---|
| 0 | OK | Success |
| 1 | CANCELLED | Request cancelled |
| 2 | UNKNOWN | Server error |
| 3 | INVALID_ARGUMENT | Bad request |
| 4 | DEADLINE_EXCEEDED | Timeout |
| 5 | NOT_FOUND | Resource not found |
| 7 | PERMISSION_DENIED | Auth failure |
| 12 | UNIMPLEMENTED | Method not on server |
| 14 | UNAVAILABLE | Server down |

UI: status code 0 = green badge "OK". Non-zero = red badge with code name.

---

## 8. Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | Server reflection disabled | Show error "Server reflection not available — upload a .proto file" |
| 2 | Multi-file proto with imports | Collect all imported files; compile together in temp dir |
| 3 | Proto has nested messages | Descriptor pool handles recursively; json_to_proto_message recurses |
| 4 | TLS disabled but server requires TLS | gRPC connection error surfaced in response status |
| 5 | SSRF: gRPC to private IP | assert_safe_url check on server_url host — reuse ssrf.py |
| 6 | Streaming session leak | GC sessions idle > 5 min; background task runs every 60s |
| 7 | Client streaming: send after end | Reject POST /send if session already ended — 400 |
| 8 | Large streaming response (millions of messages) | Timeline virtualised (react-virtual); cap in-memory at 10,000 events |
| 9 | Proto field type mismatch in JSON message | grpcio raises parse error; surface as "Message format error: {detail}" |
| 10 | Bidi stream: server ends stream first | Session state → "server_closed"; still allow client to send until client ends |

---

## 9. Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Python gRPC lib | `grpcio` + `grpcio-tools` | Only mature Python gRPC lib; 50MB acceptable |
| 2 | Proto compilation | `grpc_tools.protoc` into in-memory descriptor pool | No generated code files needed; dynamic stubs |
| 3 | Streaming transport | SSE (existing pattern) | Reuses SSE infrastructure from spec 19-sse; no new WebSocket dependency |
| 4 | Streaming session store | In-memory dict (v1) | Simple; Redis upgrade if multi-process needed |
| 5 | SSRF guard | Wrap host in `https://` prefix → pass to assert_safe_url | Reuses existing ssrf.py without modification |
| 6 | Proto storage | DB text column (not filesystem) | Avoids filesystem management; proto files are small (<100KB typical) |
| 7 | Method type detection | From proto descriptor / reflection metadata | Source of truth; not user-selectable |
| 8 | Auth injection | Same auth_strategies.py — inject as gRPC metadata | Bearer token → `authorization: Bearer <token>` metadata; API key → key metadata |

---

## 10. Deferred Items

| Item | Reason |
|---|---|
| gRPC Mock Servers | Complex; separate spec item; post-v1 |
| gRPC → REST transcoding | Not part of testing tool scope |
| TLS client certificate for gRPC | Cross-ref spec 22-security; share ClientCertificate model |
| gRPC-Web (browser-native) | Not needed — APIPilot has backend proxy |
| Collection runner gRPC support | Phase 2 |
| gRPC API governance / schema validation | Cross-ref spec 23-governance |
| Demand gate | Implement only after confirmed user demand — original decision stands |
