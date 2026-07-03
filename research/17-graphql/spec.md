# Spec — GraphQL

STATUS: updated
LAST_CHANGED: 2026-06-16

---

## Overview

Postman ships a **dedicated GraphQL client** — NOT just JSON body mode. The dedicated client is
distinct from the HTTP request builder. It auto-introspects schema, renders a schema explorer,
provides a query builder, and handles subscriptions over WebSocket. HTTP body mode still works
as fallback for legacy/mixed API scenarios.

APIPilot current state: JSON body mode only. Dedicated GraphQL client is missing entirely.

---

## Postman Feature Map (what we must match)

| Feature | Postman | APIPilot | Gap |
|---|---|---|---|
| Dedicated GraphQL request type | ✅ | ❌ | P1 |
| Auto-introspection on URL entry | ✅ | ❌ | P1 |
| Schema explorer (browse fields/types) | ✅ | ❌ | P1 |
| Query builder (click fields → generates query) | ✅ | ❌ | P2 |
| Variables editor (separate panel) | ✅ | ❌ | P1 |
| Operation name selector (multi-op files) | ✅ | ❌ | P2 |
| Subscriptions over WebSocket | ✅ | ❌ | P2 |
| Schema import from file / API definition | ✅ | ❌ | P2 |
| Test scripts (before-query + after-response) | ✅ | ❌ | P2 |
| Split-pane view (schema + query + response) | ✅ | ❌ | P1 |
| Readable error feedback in query editor | ✅ | ❌ | P2 |
| HTTP body fallback mode | ✅ | ✅ | — |

---

## Backend

### DB Model Changes

No new DB tables required. GraphQL requests are stored as regular `Request` rows with
`protocol = "graphql"`. New fields needed on existing `Request` model:

```
Request.graphql_query       TEXT        -- raw query string
Request.graphql_variables   JSONB       -- variables object, nullable
Request.graphql_operation   VARCHAR     -- operation name, nullable
Request.graphql_schema_url  VARCHAR     -- endpoint used for introspection cache, nullable
```

### New Table: `GraphqlSchemaCache`

Introspection result is cached per endpoint URL to avoid re-fetching on every open.

```
id              UUID PK
workspace_id    UUID FK → Workspace.id
endpoint_url    VARCHAR NOT NULL
schema_sdl      TEXT NOT NULL          -- SDL string from introspection
fetched_at      TIMESTAMPTZ NOT NULL
```

Unique constraint: `(workspace_id, endpoint_url)`

TTL: 15 minutes from `fetched_at` — stale cache triggers re-introspection on next open.

### New Endpoints

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST | `/graphql/introspect` | viewer | Introspect a GraphQL endpoint, cache result, return SDL |
| GET | `/graphql/schema-cache` | viewer | Return cached SDL for given endpoint_url |
| DELETE | `/graphql/schema-cache` | editor | Bust cache for given endpoint_url (manual refresh) |
| POST | `/graphql/execute` | viewer | Execute a GraphQL query/mutation against an endpoint |
| POST | `/graphql/subscription/connect` | viewer | Initiate WebSocket subscription, return WS session token |

#### POST `/graphql/introspect`

Request:
```json
{
  "endpoint_url": "https://api.example.com/graphql",
  "headers": { "Authorization": "Bearer ..." }
}
```

Response:
```json
{
  "schema_sdl": "type Query { ... }",
  "cached": false,
  "fetched_at": "2026-06-16T10:00:00Z"
}
```

Business logic:
1. Check `GraphqlSchemaCache` for `(workspace_id, endpoint_url)` where `fetched_at > now() - 15min`.
2. If cache hit → return cached SDL with `cached: true`.
3. If miss → send GraphQL introspection query to `endpoint_url` with provided headers.
4. Parse response → extract `__schema` → convert to SDL string.
5. Upsert `GraphqlSchemaCache` row.
6. Return SDL.

#### POST `/graphql/execute`

Request:
```json
{
  "endpoint_url": "https://api.example.com/graphql",
  "query": "query GetUser($id: ID!) { user(id: $id) { name email } }",
  "variables": { "id": "123" },
  "operation_name": "GetUser",
  "headers": { "Authorization": "Bearer ..." }
}
```

Response: raw GraphQL server response (passthrough), wrapped in `create_response()`.

#### POST `/graphql/subscription/connect`

Initiates a WebSocket connection to the target endpoint. Returns a `ws_session_id`.
Client connects to APIPilot's WS relay using `ws_session_id`; APIPilot proxies messages.

Note: APIPilot acts as a relay (browser can't set custom WS headers directly).

### Validation Rules

- `endpoint_url`: must be valid URL, must be `https://` in production
- `query`: max 50 KB; must be non-empty
- `variables`: must be valid JSON object if present; max 1 MB
- `operation_name`: max 255 chars; alphanumeric + underscore only

### Modified Files

| File | Change |
|---|---|
| `models/request.py` | Add `graphql_query`, `graphql_variables`, `graphql_operation`, `graphql_schema_url` fields |
| `routers/graphql.py` | New file — introspect, execute, schema-cache, subscription endpoints |
| `services/graphql_service.py` | Introspection logic, SDL conversion, cache management |
| `models/graphql_schema_cache.py` | New ORM model |
| `migrations/` | Add columns to `requests`, create `graphql_schema_cache` |

---

## Frontend

### Component Inventory

| Component | Location | Purpose |
|---|---|---|
| `GraphqlRequestPane` | `src/components/graphql/GraphqlRequestPane.tsx` | Top-level container; splits into schema panel + editor panel |
| `GraphqlSchemaExplorer` | `src/components/graphql/GraphqlSchemaExplorer.tsx` | Left panel; tree view of types/fields; search box |
| `GraphqlQueryEditor` | `src/components/graphql/GraphqlQueryEditor.tsx` | Center panel; CodeMirror 6 with graphql-language-support |
| `GraphqlVariablesEditor` | `src/components/graphql/GraphqlVariablesEditor.tsx` | JSON editor for variables (CodeMirror 6 JSON mode) |
| `GraphqlOperationSelector` | `src/components/graphql/GraphqlOperationSelector.tsx` | Dropdown to pick operation when query file has multiple |
| `GraphqlResponsePanel` | `src/components/graphql/GraphqlResponsePanel.tsx` | Response JSON viewer; shows errors inline |
| `GraphqlSubscriptionPanel` | `src/components/graphql/GraphqlSubscriptionPanel.tsx` | Real-time message stream; connect/disconnect button |
| `GraphqlSchemaImportModal` | `src/components/graphql/GraphqlSchemaImportModal.tsx` | Import SDL from file or API definition |
| `IntrospectionRefreshButton` | `src/components/graphql/IntrospectionRefreshButton.tsx` | Manual bust of schema cache |

### TypeScript Interfaces

```typescript
interface GraphqlRequestState {
  endpointUrl: string;
  query: string;
  variables: string;        // raw JSON string (editor content)
  operationName: string | null;
  headers: Record<string, string>;
  schemaSDL: string | null;
  schemaCached: boolean;
  schemaFetchedAt: string | null;
  introspectionLoading: boolean;
  introspectionError: string | null;
  activeTab: 'query' | 'variables' | 'headers' | 'scripts';
  subscriptionMessages: SubscriptionMessage[];
  subscriptionConnected: boolean;
}

interface SubscriptionMessage {
  id: string;
  receivedAt: string;       // ISO timestamp
  payload: unknown;
}

interface GraphqlSchemaExplorerProps {
  schemaSDL: string | null;
  onFieldSelect: (fieldPath: string) => void;  // inserts field into query editor
  loading: boolean;
}

interface GraphqlOperationSelectorProps {
  query: string;                              // parsed to extract operation names
  selectedOperation: string | null;
  onChange: (name: string) => void;
}
```

### Component Render Descriptions

**`GraphqlRequestPane`**: Three-column layout. Left = `GraphqlSchemaExplorer` (collapsible, ~300px). Center = `GraphqlQueryEditor` + tab strip (Query / Variables / Headers / Scripts). Right = `GraphqlResponsePanel` or `GraphqlSubscriptionPanel` depending on operation type.

**`GraphqlSchemaExplorer`**: Tree of root types (Query, Mutation, Subscription). Expand to see fields + arg types. Search box filters tree. Clicking a field appends it to query editor at cursor. Shows scalar types inline, objects as expandable nodes.

**`GraphqlQueryEditor`**: CodeMirror 6 with `@graphql-tools/schema` + `codemirror-graphql` for autocomplete against loaded SDL. Syntax highlighting, error underlines from server response mapped back to AST positions. Shows operation name in tab label.

**`GraphqlVariablesEditor`**: CodeMirror 6 JSON mode. Validates against variable definitions parsed from query. Shows type mismatches inline.

**`GraphqlOperationSelector`**: Visible only when query string contains 2+ operation definitions. Parse with `graphql` package `parse()`. Dropdown lists all operation names. Sends selected name as `operationName` in execute call.

**`GraphqlSubscriptionPanel`**: Shows connection status badge (Connected / Disconnected). Message list with timestamp + payload (collapsible JSON). Scroll lock toggle. "Clear messages" button.

**`GraphqlSchemaImportModal`**: Tab: "From URL" (re-triggers introspection with custom headers) | "From file" (SDL .graphql upload) | "From API Definition" (pick saved OpenAPI/SDL spec from workspace).

### API Calls

| Action | Method | URL | When |
|---|---|---|---|
| Auto-introspect on URL change | POST | `/graphql/introspect` | 500ms debounce after endpoint URL typed |
| Manual refresh schema | DELETE + POST | `/graphql/schema-cache` then `/graphql/introspect` | Refresh button clicked |
| Execute query/mutation | POST | `/graphql/execute` | Send button clicked |
| Connect subscription | POST | `/graphql/subscription/connect` | Subscribe button clicked |
| Save request | PATCH | `/requests/{id}` | Auto-save on query/variables change (2s debounce) |

### Library Decisions

| Decision | Choice | Reason |
|---|---|---|
| GraphQL query editor | CodeMirror 6 + `codemirror-graphql` | Already use CodeMirror 6 for JS scripts; consistent; supports SDL-aware autocomplete |
| Schema parsing | `graphql` npm package (`graphql-js`) | Official parser; needed for operation extraction + variable type checking |
| Schema tree rendering | Custom recursive component | Schema trees are small (<500 nodes typically); no need for virtualization |
| Subscription transport | WebSocket via APIPilot proxy | Browser blocks custom WS headers; relay pattern same as SSE proxy decision |

---

## Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Dedicated request type vs JSON body mode | Both | JSON body mode kept for legacy; new "GraphQL" type added as protocol option |
| 2 | Introspection caching | 15-min server-side cache in DB | Avoids hammering target API on every tab open; user can manually bust |
| 3 | Subscription relay | APIPilot WS proxy | Browser can't set custom headers on native WebSocket; must relay via server |
| 4 | Schema tree | Custom component | Schema trees rarely exceed 500 nodes; tree library overhead not justified |
| 5 | Variable validation | Client-side only (parse query → extract types) | Server-side validation happens at target GraphQL API; no need to duplicate |
| 6 | SDL conversion from introspection | `graphql-js` `buildClientSchema` + `printSchema` | Standard; produces clean SDL string for caching |

---

## Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | Introspection disabled on target API | Return 200 with `schema_sdl: null`; show "Introspection disabled" banner; query editor works without autocomplete |
| 2 | Multiple operations in query, none selected | Block execute; show "Select an operation" error inline |
| 3 | Variables JSON is invalid when Send clicked | Block execute; highlight parse error in variables editor |
| 4 | Subscription WebSocket closes unexpectedly | Show "Connection closed" badge; keep message history; offer Reconnect button |
| 5 | Schema cache stale (target schema changed) | Manual refresh button always visible; 15-min TTL auto-expires |
| 6 | `operation_name` not in parsed operations list | Reject at BE validation; return 400 with list of valid operation names |
| 7 | Query returns both `data` and `errors` | Show both sections in response panel (partial success is valid GraphQL) |
| 8 | Introspection response > 5 MB | Cap SDL storage at 5 MB; truncate with warning; schema explorer shows partial tree |

---

## Deferred

| Item | Reason |
|---|---|
| GraphQL Federation / subgraphs | Complex multi-schema topology; V2 |
| Persisted queries (APQ) | Niche use case; requires server-side APQ support detection |
| Custom scalars rendering | Need per-scalar UI widgets; deferred until demand |
| Subscription over SSE (graphql-sse) | Less common than WebSocket; add if user demand |
| Schema diffing between introspection runs | Useful but complex; deferred to OpenAPI diff feature parity work |
