# Phase 6 — API Design

LAST_UPDATED: 2026-06-15

> New endpoints to build, in project convention: thin handler, `username` header auth,
> `create_response()` wrapper, workspace RBAC via `can_access_workspace(min_role=...)`.
> All responses wrapped `{response_code, data, message, error_message}`.
> Auth = `Authorization: Bearer <jwt>` + `username` header on every route unless noted public.

---

## Conventions (apply to every new endpoint)
| Aspect | Rule |
|---|---|
| Auth header | `username` + Bearer JWT (AuthMiddleware) |
| RBAC | viewer (read), editor (write), admin (manage), owner (delete ws) |
| Status | 200 read · 201 create · 204 delete · 400 bad · 401 unauth · 403 forbidden · 404/206 not-found · 409 conflict · 422 validation |
| Pagination | `limit` (default 50, max 200) + `offset` on all list endpoints |
| Body | Pydantic v1 schema, never raw dict |

---

## Request Auth Helpers
| Method | Path | Body | Min Role | Purpose |
|---|---|---|---|---|
| PUT | `/api/{api_id}/auth` | `{type, config}` | editor | Set declarative auth (apikey/bearer/basic/oauth2/aws_sig/jwt) on an API |
| POST | `/auth/oauth2/token` | `{client_id, client_secret, token_url, scope, grant}` | editor | Fetch+cache OAuth2 token (→ oauth_tokens) |
| GET | `/auth/oauth2/token/{auth_ref}` | — | editor | Return cached token status (never raw secret) |
Notes: secrets in `config` encrypted at rest; execute_direct injects resolved auth before httpx send.

## Variables (scope chain completion)
| Method | Path | Min Role | Purpose |
|---|---|---|---|
| GET/PUT | `/node/{node_id}/variables` | viewer/editor | Collection-scoped variables |
| GET | `/resolve/preview` | viewer | Preview resolved value across full chain (global→collection→env→local) |
Reuse existing: `/variables/global`, `/environment/*`.

## Flows (orchestration / chaining)
| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST | `/flow` | editor | Create flow (graph) |
| GET | `/flow?workspace_id=&limit=&offset=` | viewer | List flows |
| GET | `/flow/{id}` | viewer | Flow detail + steps |
| PUT | `/flow/{id}` | editor | Update graph/steps |
| DELETE | `/flow/{id}` | editor | Delete |
| POST | `/flow/{id}/run` | editor | Execute flow → FlowRun (async, returns run_id) |
| GET | `/flow/{id}/runs` | viewer | Run history |
| GET | `/flow/run/{run_id}` | viewer | Run + step results |
Notes: step `extract` pulls jsonpath from response → run context var; next step `config` may reference `{{var}}`.

## Mock Servers
| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST | `/mock` | editor | Create mock server (returns public_token) |
| GET/PUT/DELETE | `/mock/{id}` | viewer/editor | Manage |
| POST | `/mock/{id}/routes` | editor | Add route |
| ANY | `/m/{public_token}/{path:path}` | **public** | Serve matched mock response (no auth) |
Notes: public serve route bypasses AuthMiddleware (add to public_routes prefix match).

## API Design / Contract
| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST | `/spec/import` | editor | Upload OpenAPI/Swagger → generate nodes+apis+cases (extend bulk_import) |
| GET | `/spec?workspace_id=` | viewer | List specs |
| POST | `/spec/{id}/contract-test` | editor | Validate live responses vs schema (reuse validator.py + jsonschema) |

## Documentation
| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST | `/node/{id}/docs/generate` | editor | Render collection → doc model |
| POST | `/node/{id}/docs/publish` | admin | Publish (returns public_token) |
| GET | `/docs/{public_token}` | **public** | Public doc page data |

## Collaboration
| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST | `/comments` | viewer | Add comment (entity_type, entity_id) |
| GET | `/comments?entity_type=&entity_id=` | viewer | Thread |
| DELETE | `/comments/{id}` | author/admin | Remove |
| POST | `/node/{id}/versions` | editor | Snapshot |
| GET | `/node/{id}/versions` | viewer | History |
| POST | `/node/{id}/versions/{vid}/restore` | editor | Restore snapshot |

## Monitoring
| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST | `/monitor` | editor | Create monitor (wraps a schedule) |
| GET | `/monitor?workspace_id=` | viewer | List w/ uptime + p95 |
| GET | `/monitor/{id}` | viewer | Detail + latency series |
Reuse: `bulk_test_schedules`, `schedule_alerts`, executions.

## Protocols
| Method | Path | Purpose |
|---|---|---|
| WS | `/api/sse-proxy?target_url=` | SSE streaming proxy (reuse ws_proxy pattern) |
| POST | `/api/grpc-call` | gRPC unary call (proto upload) |
| POST | `/api/soap-call` | SOAP envelope send |

## Governance
| Method | Path | Min Role | Purpose |
|---|---|---|---|
| GET/PUT | `/governance/rules` | admin | Manage ruleset (naming/validation) |
| POST | `/governance/lint` | viewer | Lint specs/apis → report |

## Audit
| Method | Path | Min Role | Purpose |
|---|---|---|---|
| GET | `/audit?workspace_id=&limit=&offset=` | admin | Read audit log |
(Writes are implicit side-effect of mutating endpoints — middleware/helper, not an endpoint.)

---

## Example Endpoint Spec (full contract — template for build)
```
POST /flow/{id}/run
Auth: Bearer + username header; min_role=editor on flow.workspace_id
Request: { "input_vars": { "userId": "42" } }   # optional seed context
Responses:
  201 { response_code:201, data:{ run_id:int, status:"queued" } }
  403 { response_code:403, error_message:"Access denied" }
  404 { response_code:206, error_message:"Flow not found" }   # project 206 quirk
  422 validation
Side effects: creates FlowRun, enqueues async exec, writes audit_log(action="flow.run")
Idempotency: not idempotent; client should debounce
```

---

## Validation Checklist — Phase 6
- [x] Every missing feature → endpoint(s) with method/path/role/purpose
- [x] Conventions table (auth, status, pagination) defined
- [x] Public (no-auth) routes flagged (mock serve, public docs)
- [x] Reuse noted (bulk_import, validator, schedules)
- [x] One full contract example incl. 206 quirk + audit side effect
- [x] No implementation code
