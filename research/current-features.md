# Phase 1 — Feature Inventory Matrix

LAST_UPDATED: 2026-06-15
STATUS LEGEND: **Existing** (works end-to-end) · **Partial** (some path exists, incomplete) · **Missing** (no code)

> Evidence column points to the file(s) that prove the status. Cross-checked against
> `research/phases/*` (done/empty markers) and live code.

---

## Core API
| Feature | Description | Status | Evidence |
|---|---|---|---|
| Request Builder | Build + send HTTP request | Existing | `components/RequestPanel`, `runner/execute_direct.py` |
| HTTP Methods | GET/POST/PUT/DELETE/PATCH | Existing | `Api.method`, MethodBadge |
| URL Builder | URL with `{{VAR}}` resolution | Existing | `resolve_variables`, RequestPanel |
| Query Params | key/value params | Existing | `ApiCase.params`, execute_direct |
| Path Params | `{id}` style in endpoint | Partial | stored in `Api.endpoint`; no dedicated param-binding UI |
| Headers | folder-inherited + per-request | Existing | `headers/*`, `get_headers` merge |
| Authentication | Bearer + Basic (UI sets header) | Partial | RequestPanel `authType` (none/bearer/basic) only |
| Request Body Types | raw/JSON, form-data, url-encoded | Existing | execute_direct `body_type` FORM-DATA/URL-ENCODED |
| Response Viewer | status/body/headers/time | Existing | RequestPanel, `request_history` |

## Collections
| Feature | Description | Status | Evidence |
|---|---|---|---|
| Collections | folder/file tree per workspace | Existing | `Node` model, `node/*` |
| Folder Structure | nested folders, move/copy | Existing | move_node, copy_node, self-ref tree |
| Collection Variables | vars scoped to a collection | Missing | only workspace-env + user-global exist |
| Sharing | share collection externally | Partial | workspace member sharing only, not per-collection |
| Documentation | per-collection docs | Missing | `Api.description` free-text only |

## Variables
| Feature | Status | Evidence |
|---|---|---|
| Global Variables | Existing | `GlobalVariable` (per-user, cross-workspace) |
| Collection Variables | Missing | — |
| Environment Variables | Existing | `Environment.variables` JSON, one active/workspace |
| Local Variables | Missing | no request-scoped vars |
| Secret Variables | Partial | `is_secret` masks display, **stored plaintext** |
| Dynamic Variables | Partial | only `${ts}` timestamp token |

## Authentication (request auth helpers)
| Feature | Status | Evidence |
|---|---|---|
| API Key | Missing | manual header only |
| Bearer Token | Existing | RequestPanel bearer |
| JWT (builder) | Missing | no JWT signing helper |
| Basic Auth | Partial | UI option present, encoding path thin |
| OAuth2 | Missing | — |
| AWS Signature | Missing | — |
| Custom Auth | Partial | raw headers cover it manually |

## Testing
| Feature | Status | Evidence |
|---|---|---|
| Test Scripts (JS sandbox) | Missing | no pm.* / JS execution |
| Assertions | Existing | `ApiCase.expected`, AssertionBuilder, validator.py |
| Response Validation | Existing | validator.py |
| Schema Validation | Existing | phase_4_test_power (done), schema validate |
| Contract Testing | Missing | no OpenAPI contract diff |

## Automation
| Feature | Status | Evidence |
|---|---|---|
| Collection Runner | Existing | bulk_run_cases.py, BulkTestPanel |
| Request Chaining | Missing | no value-extraction-into-next-request |
| Scheduled Runs | Existing | bulk_test_schedules, scheduler worker |
| Batch Runs | Existing | bulk_run_cases |

## Collaboration
| Feature | Status | Evidence |
|---|---|---|
| Workspaces | Existing | `Workspace`, workspace/* |
| Sharing | Existing | members + invites (email token, 7-day) |
| Comments | Missing | — |
| Version Control | Missing | no history/branching of collections |

## Mocking
| Feature | Status | Evidence |
|---|---|---|
| Mock Servers | Missing | — |
| Dynamic Responses | Missing | — |

## Monitoring
| Feature | Status | Evidence |
|---|---|---|
| Monitors | Partial | scheduled bulk runs ≈ monitor; no dedicated uptime monitor |
| Health Checks | Partial | `/health` for self only, not target APIs |
| Alerts | Existing | `ScheduleAlert` email/webhook on success/failure/partial |

## Documentation
| Feature | Status | Evidence |
|---|---|---|
| Generated Documentation | Missing | — |
| Examples | Partial | saved cases act as examples |
| Publishing | Missing | — |

## API Design
| Feature | Status | Evidence |
|---|---|---|
| OpenAPI | Partial | own app exposes `/openapi.json`; no import of user specs |
| Swagger | Partial | own `/swagger` only |
| Schema Management | Missing | no spec registry |

## Advanced Protocols
| Feature | Status | Evidence |
|---|---|---|
| GraphQL | Existing | graphql_introspect.py, body type |
| WebSocket | Existing | ws_proxy.py, WebSocketPanel |
| SSE | Missing | — |
| gRPC | Missing | — |
| SOAP | Missing | — |

## Security
| Feature | Status | Evidence |
|---|---|---|
| Secret Storage | Partial | masked display only, plaintext at rest |
| Vault Integration | Missing | — |
| RBAC | Existing | viewer/editor/admin + owner + god |
| Audit Logs | Partial | login audit only (`sso_verify_login`); no action audit |

## Governance
| Feature | Status | Evidence |
|---|---|---|
| API Standards | Missing | — |
| Naming Rules | Missing | — |
| Validation Rules | Missing | — |

## Flows
| Feature | Status | Evidence |
|---|---|---|
| Workflow Builder | Missing | — |
| Conditional Logic | Missing | — |
| API Orchestration | Missing | — |

---

## Feature Inventory Score
| Status | Count |
|---|---|
| Existing | 24 |
| Partial | 14 |
| Missing | 22 |
| **Total tracked** | **60** |

Existing ≈ 40% · Partial ≈ 23% · Missing ≈ 37%. Strong core (request/collections/variables/runner/scheduler/alerts/collab), weak on mocking, flows, governance, advanced protocols, secret-at-rest, docs.

---

## Validation Checklist — Phase 1
- [x] Every Postman category mapped to a status
- [x] Each status backed by file evidence
- [x] Reconciled with `research/phases/*` done/empty markers
- [x] Score computed
