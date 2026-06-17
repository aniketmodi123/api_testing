# Spec — Mock Servers

STATUS: Research-complete
LAST_CHANGED: 2026-06-16
SOURCE: Postman Learning Center (live fetch 2026-06-16) + prior phase spec

## Goal

Provide shareable mock endpoints based on collection examples so frontend/consumer teams
can develop against a live URL before the real API exists. Differentiator: unlimited mock
calls free (Postman free tier caps at 1,000 mock calls/month).

---

## 1. Postman Feature Catalog (ground truth)

### 1.1 Creation Methods
| Method | Description |
|---|---|
| From existing collection | Select collection → create mock from its saved examples |
| From scratch (new collection) | Postman creates empty collection alongside mock |
| From request history | Pick a request from History tab → mock that request |
| From OpenAPI spec | Import spec → Postman creates collection + mock |

APIPilot scope: **from existing collection** only for v1. OpenAPI → mock deferred (links to feature 20).

### 1.2 Access Control
| Mode | Behavior |
|---|---|
| Public | Anyone with the URL can call the mock (no auth required) |
| Private | Caller must send `x-api-key: <postman-api-key>` header |

APIPilot: Public mocks (no auth header) for v1. Private mocks (workspace API key check) deferred.

### 1.3 Configuration Options
| Option | Detail |
|---|---|
| Name | Display name for mock server |
| Collection | Required; defines examples used for matching; cannot change post-create |
| Environment | Optional; injects env vars into example resolution |
| Network delay | Simulated response latency: none / 2 s / 5 s / custom (ms) |
| Body matching | When on: only examples whose body matches incoming body are considered |
| Header matching | Comma-separated header names to match; case-insensitive |
| Private | Requires API key header to call |

### 1.4 Matching Algorithm (7-step priority)

Postman uses a scoring algorithm starting at 100, penalizing partial matches:

1. **HTTP method** — filter out all examples that don't share the same method
2. **Custom header override** (evaluated before scoring):
   - `x-mock-response-id: <userId>-<responseId>` → return exact example by ID
   - `x-mock-response-name: <name>` → return example by name; on tie, prefer 200 status
   - `x-mock-response-code: <code>` → filter to examples with that response status code
3. **URL path scoring** — examples start at 100; penalty applied by match type:
   | Match quality | Penalty |
   |---|---|
   | Perfect | 0 |
   | Trailing slash difference | -5 |
   | Case-insensitive | -10 |
   | Wildcard variable | -20 |
   | Alphanumeric ID substitution | -21 |
   | Document distance algorithm | -30 |
   | No match | eliminated |
4. **Query parameter scoring** — % match of key-value pairs; partial matches reduce score
5. **Header matching** (when enabled via config or `x-mock-match-request-headers`) — non-matching eliminated
6. **Body matching** (when enabled via config or `x-mock-match-request-body`) — non-matching eliminated; matching body boosts score; when disabled, body match is a soft boost only
7. **Tiebreaker** — sort by example ID; prefer 200 status; return first in sorted list

### 1.5 x-mock-* Special Headers
| Header | Behavior |
|---|---|
| `x-mock-response-id` | Pin response to specific example UID |
| `x-mock-response-name` | Pin response to example by name |
| `x-mock-response-code` | Filter to examples with this HTTP status code |
| `x-mock-match-request-body` | Override mock body-matching setting per-request |
| `x-mock-match-request-headers` | Comma-separated headers to match per-request |

APIPilot must implement all 5 headers in the mock proxy handler.

### 1.6 Dynamic Variables in Responses
Postman resolves these at response time (powered by Faker):

**Random data:**
`{{$randomFullName}}`, `{{$randomUserName}}`, `{{$randomEmail}}`, `{{$randomCity}}`,
`{{$randomCompanyName}}`, `{{$randomJobTitle}}`, `{{$randomUUID}}`, `{{$timestamp}}`
(full Faker variable list mirrors the Variables spec in `research/04-variables/`)

**Request-capture helpers (Handlebars-style):**
| Template | What it returns |
|---|---|
| `{{$body 'path.to.prop'}}` | Value from incoming request body at JSON path |
| `{{$body 'prop' 'default'}}` | With fallback default |
| `{{$queryParams 'key'}}` | Query param value from incoming request |
| `{{$pathSegments '1'}}` | Path segment by index (0-based) |
| `{{$headers 'header-name'}}` | Incoming request header value |

**Variable scope**: collection vars + environment vars resolved; global vars and vault secrets are NOT resolved in mock context.

### 1.7 Fallback / No-Match Behavior
- If no example matches: return `404` with Postman error JSON
- If `x-mock-response-id` specified but ID not found: return error
- If only one example exists: always return it regardless of matching score

### 1.8 Call Log (Postman)
- Postman records each incoming request to a mock server
- Log shows: timestamp, method, path, matched example name, response status, latency
- Expandable: full request headers + body, response headers + body
- Retention: not explicitly documented (assume session-level / short window)
- APIPilot: persist call log to DB; 30-day retention

### 1.9 Plan Gating
| Feature | Postman Free | Postman Paid | APIPilot |
|---|---|---|---|
| Mock call limit/month | 1,000 | Higher / unlimited | Unlimited (differentiator) |
| Private mocks | No | Yes | v1 deferred |
| Multi-region mock | No | No (mock is single region) | N/A |
| Custom delay | Yes | Yes | Yes |
| Body/header matching | Yes | Yes | Yes |

---

## 2. Backend Specification

### 2.1 DB Models

#### `MockServer` (existing — extend)
```python
id: UUID PK
workspace_id: UUID FK
collection_id: UUID FK
environment_id: UUID FK nullable
name: str
is_private: bool default False
delay_ms: int default 0          # simulated response delay
match_body: bool default False   # enable body matching globally
match_headers: str nullable      # comma-separated header names to match
call_count: int default 0        # total lifetime calls (increment on each proxy hit)
created_by: UUID FK → User
created_at: datetime UTC
updated_at: datetime UTC
```

#### `MockCall` (new — call log)
```python
id: UUID PK
mock_id: UUID FK → MockServer
timestamp: datetime UTC
method: str
path: str
query_string: str nullable
request_headers: JSON
request_body: str nullable
matched_example_id: UUID nullable  # null if no match
matched_example_name: str nullable
response_status: int
response_headers: JSON
response_body: str
latency_ms: int
created_at: datetime UTC
```

Retention: hard-delete `MockCall` rows older than 30 days (background cleanup job).

### 2.2 Endpoints

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST | `/mocks` | editor | Create mock server |
| GET | `/mocks` | viewer | List mock servers for workspace |
| GET | `/mocks/{id}` | viewer | Get mock detail + config |
| PUT | `/mocks/{id}` | editor | Update mock (name, env, delay, matching config) |
| DELETE | `/mocks/{id}` | editor | Delete mock + all call logs |
| GET | `/mocks/{id}/calls` | viewer | Paginated call log (default 50/page, desc by timestamp) |
| DELETE | `/mocks/{id}/calls` | editor | Clear call log |
| ANY | `/mock-proxy/{mock_id}/{path:path}` | public | Mock proxy endpoint |

### 2.3 Mock Proxy Handler Logic

```
POST/GET/PUT/... /mock-proxy/{mock_id}/{path}

1. Load MockServer by mock_id; 404 if not found or deleted
2. If is_private: check x-api-key header matches workspace API key; 401 if missing/wrong
3. Apply delay_ms (asyncio.sleep)
4. Load all examples from MockServer.collection_id (via collection API / DB join)
5. Run matching algorithm (7 steps from section 1.4)
6. If no match: log call with response_status=404; return 404 JSON error
7. Resolve dynamic variables in matched example response body:
   a. Faker variables: {{$randomXxx}}, {{$timestamp}}, {{$randomUUID}}
   b. Request-capture: {{$body '...'}}, {{$queryParams '...'}}, {{$pathSegments '...'}}, {{$headers '...'}}
   c. Collection + env vars: {{varName}}
8. Return resolved response (status, headers, body from example)
9. Log call to MockCall table asynchronously (fire-and-forget; never block response)
10. Increment MockServer.call_count atomically (UPDATE ... SET call_count = call_count + 1)
```

### 2.4 Matching Algorithm Implementation

```python
def match_example(request, examples, config) -> Example | None:
    # Step 1: filter by HTTP method
    candidates = [e for e in examples if e.method == request.method]

    # Step 2: x-mock-response-id override
    if rid := request.headers.get('x-mock-response-id'):
        return next((e for e in candidates if e.id == rid), None)

    # x-mock-response-name override
    if rname := request.headers.get('x-mock-response-name'):
        matches = [e for e in candidates if e.name == rname]
        return _tiebreak(matches)

    # x-mock-response-code filter
    if rcode := request.headers.get('x-mock-response-code'):
        candidates = [e for e in candidates if str(e.response_status) == rcode]

    # Step 3-6: score remaining candidates
    scored = [(e, score_example(e, request, config)) for e in candidates]
    scored = [(e, s) for e, s in scored if s > 0]

    if not scored:
        return None

    max_score = max(s for _, s in scored)
    top = [e for e, s in scored if s == max_score]
    return _tiebreak(top)

def _tiebreak(examples):
    sorted_ = sorted(examples, key=lambda e: e.id)
    two_hundreds = [e for e in sorted_ if e.response_status == 200]
    return two_hundreds[0] if two_hundreds else (sorted_[0] if sorted_ else None)
```

### 2.5 Modified Files
| File | Change |
|---|---|
| `src/models/mock_server.py` | Add `is_private`, `delay_ms`, `match_body`, `match_headers`, `call_count` |
| `src/models/mock_call.py` | New model `MockCall` |
| `src/routers/mocks.py` | Add PUT, GET /calls, DELETE /calls endpoints |
| `src/routers/mock_proxy.py` | Full matching algorithm + dynamic var resolution + call logging |
| `src/services/mock_matcher.py` | New service: 7-step matching algorithm |
| `src/services/mock_variable_resolver.py` | New service: Faker + request-capture template resolution |
| `src/tasks/cleanup.py` | Add MockCall 30-day retention cleanup job |

---

## 3. Frontend Specification

### 3.1 Library Decisions
| Decision | Choice | Reason |
|---|---|---|
| JSON viewer | `react-json-view` | Collapsible tree, themed, ideal for call log request/response bodies |
| State | Redux slice `mocksSlice` | Consistent with rest of app |

### 3.2 Component Inventory

| Component | Location | Purpose |
|---|---|---|
| `MockServerListView` | `features/mocks/MockServerListView.tsx` | List of all mocks: name, URL (copy button), collection, call count, created date |
| `CreateMockModal` | `features/mocks/CreateMockModal.tsx` | Form: name, collection picker, environment picker, delay, body/header matching toggles |
| `EditMockModal` | `features/mocks/EditMockModal.tsx` | Same form pre-populated; cannot change collection |
| `MockServerDetailView` | `features/mocks/MockServerDetailView.tsx` | URL display + copy button + tabs: Call Log / Configuration |
| `MockCallLog` | `features/mocks/MockCallLog.tsx` | Paginated table of incoming calls; filter by status/method |
| `MockCallRow` | `features/mocks/MockCallRow.tsx` | Single call row: timestamp, method, path, matched example, status badge, latency |
| `MockCallDetail` | `features/mocks/MockCallDetail.tsx` | Expanded call: req headers/body (react-json-view) + response headers/body |
| `MockUrlDisplay` | `features/mocks/MockUrlDisplay.tsx` | URL pill with one-click copy; shows `x-mock-*` header docs tooltip |

### 3.3 TypeScript Interfaces

```typescript
interface MockServer {
  id: string;
  name: string;
  workspace_id: string;
  collection_id: string;
  collection_name: string;
  environment_id: string | null;
  environment_name: string | null;
  is_private: boolean;
  delay_ms: number;
  match_body: boolean;
  match_headers: string | null;
  call_count: number;
  mock_url: string;   // derived: `${baseUrl}/mock-proxy/${id}`
  created_at: string;
}

interface MockCall {
  id: string;
  mock_id: string;
  timestamp: string;
  method: string;
  path: string;
  query_string: string | null;
  request_headers: Record<string, string>;
  request_body: string | null;
  matched_example_id: string | null;
  matched_example_name: string | null;
  response_status: number;
  response_headers: Record<string, string>;
  response_body: string;
  latency_ms: number;
}
```

### 3.4 API Calls

| Action | Method | URL | When |
|---|---|---|---|
| List mocks | GET | `/mocks?workspace_id=X` | MockServerListView mount |
| Create mock | POST | `/mocks` | CreateMockModal submit |
| Edit mock | PUT | `/mocks/{id}` | EditMockModal submit |
| Delete mock | DELETE | `/mocks/{id}` | Confirm dialog |
| Get mock detail | GET | `/mocks/{id}` | MockServerDetailView mount |
| Get call log | GET | `/mocks/{id}/calls?page=1&limit=50` | MockCallLog mount + paginate |
| Clear call log | DELETE | `/mocks/{id}/calls` | "Clear log" button (confirm) |

### 3.5 State Shape (Redux)

```typescript
interface MocksState {
  byId: Record<string, MockServer>;
  allIds: string[];
  loading: boolean;
  error: string | null;
}

interface MockCallsState {
  byMockId: Record<string, {
    calls: MockCall[];
    page: number;
    hasMore: boolean;
    loading: boolean;
  }>;
}
```

### 3.6 UX Decisions
- Mock URL display: always visible at top of detail view; one-click copy with toast confirmation
- Call log: auto-refresh every 10 s when detail view is open (polling; SSE upgrade deferred)
- `x-mock-*` headers: info tooltip on URL display panel explaining override headers
- No-match calls: show in log with status 404 and "No match" in matched-example column (red)
- Dynamic vars info: banner in CreateMockModal explaining `{{$randomUUID}}` etc. are resolved live
- Clear log: confirm dialog warning this is irreversible

---

## 4. Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Proxy routing | `ANY /mock-proxy/{mock_id}/{path:path}` | Single catch-all route handles all methods |
| 2 | Call log storage | `MockCall` DB table | Queryable, filterable; simpler than log files |
| 3 | Call log retention | 30 days | Bounded storage; matches monitoring log retention |
| 4 | Dynamic var engine | Custom Handlebars-lite resolver | No full template engine dep needed; only 10 helpers |
| 5 | Call log write | Fire-and-forget background task | Never adds latency to mock response |
| 6 | Private mocks | Deferred (Phase 2) | Adds auth complexity; not critical for v1 |
| 7 | OpenAPI → mock | Deferred (links to feature 20) | Import spec creates collection; mock from collection covers it |
| 8 | Call log refresh | Polling 10 s | SSE would require server push infra; polling sufficient for v1 |
| 9 | Collection change | Blocked post-create | Postman behavior; changing collection invalidates all examples |

---

## 5. Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | No examples in collection | Return 404 with "No examples configured" message; log call |
| 2 | Two examples with identical path+method+params | Tiebreak by example ID; return lower ID |
| 3 | `{{$body '...'}}` when request has no body | Return empty string (not error); use default if provided |
| 4 | `x-mock-response-id` not found | Return 404 JSON `{"error": "example not found"}` |
| 5 | delay_ms causes client timeout | Cap delay at 30,000 ms at create time; warn user if > 10 s |
| 6 | Collection deleted after mock created | Mock proxy returns 404 for all calls; mock detail view shows warning |
| 7 | Circular `{{varName}}` in example body | Resolve max 1 level; do not recurse |
| 8 | Very large response body in mock call log | Cap stored `response_body` at 512 KB; truncate + add `…[truncated]` |
| 9 | Query param key exists but empty value | Counts as partial match (key present, value differs) |
| 10 | Path with URL-encoded chars | Decode before matching; match on decoded path |

---

## 6. Deferred Items

| Item | Reason |
|---|---|
| Private mock servers (API key auth) | Phase 2 — requires workspace API key infrastructure |
| OpenAPI → mock (auto-generate examples) | Covered by feature 20 (OpenAPI specs) |
| Mock from request history | Nice-to-have; collection-based covers primary use case |
| SSE call log push | Polling sufficient for v1 |
| Mock server call count billing / quota | APIPilot differentiator: unlimited free |
| Multi-environment mock (switch env via header) | Phase 2 |
