# Phase 4 — Domain Model Design

LAST_UPDATED: 2026-06-15

> Conceptual entities (existing + new) needed for Postman parity. No DDL here (→ database-design.md).
> New entities marked **[NEW]**; existing entities show only added fields.

---

## Existing Entities (recap — already implemented)
| Entity | Key relations |
|---|---|
| User | 1—N Workspace; 1—N GlobalVariable; N—N Workspace via WorkspaceMember |
| Workspace | N—1 User; 1—N Node; 1—N Environment; 1—N WorkspaceMember/Invite |
| Node (folder/file) | self-ref tree; 1—1 Header (folder); 1—1 Api (file) |
| Header | 1—1 Node(folder) |
| Api | 1—1 Node(file); 1—N ApiCase |
| ApiCase | N—1 Api |
| Environment | N—1 Workspace |
| GlobalVariable | N—1 User (by username) |
| BulkTestSchedule | 1—N BulkTestExecution; 1—N ScheduleAlert |
| BulkTestExecution | N—1 Schedule; 1—N BulkTestResult |
| BulkTestResult | N—1 Execution |
| ScheduleAlert | N—1 Schedule |
| RequestHistory | N—1 Node(file) (nullable) |
| WorkspaceMember / WorkspaceInvite | N—1 Workspace |

---

## New / Extended Entities (for parity)

### 1. CollectionVariable **[NEW]**
Scoped variable on a folder/collection node — fills the global↔environment gap.
| Field | Type | Notes |
|---|---|---|
| id | int PK | |
| node_id | FK Node | scope = this folder subtree |
| key | str | `{{key}}` |
| value | text | encrypted if secret |
| is_secret | bool | |
Relations: N—1 Node. Index: unique(node_id, key).

### 2. RequestAuth **[NEW]** (or `Api.extra_meta` extension)
Declarative auth config per Api/ApiCase replacing raw-header approach.
| Field | Type | Notes |
|---|---|---|
| id | int PK | |
| api_id / case_id | FK | one of |
| type | enum | none/apikey/bearer/basic/oauth2/aws_sig/jwt |
| config | JSON | type-specific (encrypted secrets) |
Relations: N—1 Api. (MVP: store in `Api.extra_meta.auth` to avoid new table.)

### 3. OAuthToken **[NEW]**
Cached OAuth2 tokens to avoid re-grant per request.
| Field | Type | Notes |
|---|---|---|
| id | int PK | |
| owner_username | str | |
| auth_ref | str | hash of client/scope/url |
| access_token | text | encrypted |
| refresh_token | text | encrypted, nullable |
| expires_at | datetime | |
Index: unique(owner_username, auth_ref).

### 4. Flow **[NEW]** + FlowStep + FlowRun + FlowStepResult
Orchestration / chaining engine.
| Flow | id, workspace_id FK, name, description, graph(JSON) |
| FlowStep | id, flow_id FK, order, type(request/condition/delay), api_id FK?, condition(JSON), extract(JSON jsonpath→var) |
| FlowRun | id, flow_id FK, status, started_at, finished_at, context(JSON run vars) |
| FlowStepResult | id, flow_run_id FK, step_id, success, request/response(JSON) |
Relations: Flow 1—N FlowStep, 1—N FlowRun; FlowRun 1—N FlowStepResult.

### 5. MockServer **[NEW]** + MockRoute
| MockServer | id, workspace_id FK, name, public_token(unique), enabled |
| MockRoute | id, mock_server_id FK, method, path_pattern, matcher(JSON), response_status, response_headers(JSON), response_body(text/template), delay_ms |
Relations: MockServer 1—N MockRoute. Public serve by `public_token` + match.

### 6. ApiSpec **[NEW]** (Schema Management / Contract)
| Field | Notes |
|---|---|
| id, workspace_id FK | |
| name, version | |
| format | openapi/swagger/graphql/asyncapi |
| raw(JSON), parsed(JSON) | |
Used by: OpenAPI import → nodes; contract testing → validator.

### 7. Comment **[NEW]**
| id, workspace_id FK, entity_type(node/api/case/flow), entity_id, author_username, body, parent_id(thread), created_at |

### 8. NodeVersion **[NEW]** (Version Control)
| id, node_id FK, snapshot(JSON full subtree/api), author_username, message, created_at |
Restore = re-materialize snapshot.

### 9. Documentation / PublishedDoc **[NEW]**
| id, node_id FK (collection root), rendered(JSON), public_token(unique nullable), published_at |

### 10. AuditLog **[NEW]**
| id, username, workspace_id, action, entity_type, entity_id, metadata(JSON), ip, created_at |
Write on every mutating endpoint.

### 11. Monitor **[NEW]** (thin wrapper over schedule)
| id, workspace_id FK, name, schedule_id FK, target_summary(JSON), uptime_pct, p95_latency_ms |
Aggregates BulkTestExecution outcomes into uptime/latency rollup.

### 12. SecretRef (conceptual, not necessarily a table)
Abstraction: any `is_secret` value resolves through a SecretsProvider (db-encrypted MVP → Vault/KMS later). No schema change beyond storing ciphertext.

---

## Cross-Cutting: Variable Scope Chain (target)
```
local (run/flow context)  →  environment (workspace active)  →  collection (node subtree)  →  global (user)
   highest precedence ────────────────────────────────────────────────────────────► lowest
```
Today only **environment + global** exist. Add **collection** + **local** scopes.

---

## Entity Relationship Overview (new + key existing)
```
User ─< Workspace ─< Node(tree) ─1:1─ Api ─< ApiCase
                  ├─< Environment
                  ├─< CollectionVariable (via Node)
                  ├─< Flow ─< FlowStep / FlowRun ─< FlowStepResult
                  ├─< MockServer ─< MockRoute
                  ├─< ApiSpec
                  ├─< Comment / NodeVersion / Documentation
                  ├─< Monitor ─1:1─ BulkTestSchedule ─< Execution ─< Result
                  └─< WorkspaceMember / Invite / AuditLog
User ─< GlobalVariable ;  User ─< OAuthToken
```

---

## Validation Checklist — Phase 4
- [x] Every missing feature mapped to entity(ies)
- [x] Fields, relations, key indexes/constraints noted per entity
- [x] Reuse-first: auth + examples reuse existing tables where possible
- [x] Variable scope chain defined
- [x] ER overview drawn
- [x] No DDL/implementation (deferred to Phase 5)
