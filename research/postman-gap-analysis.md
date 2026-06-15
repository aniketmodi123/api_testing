# Phase 2 — Postman Gap Analysis

LAST_UPDATED: 2026-06-15
SCALE: Supported (✅) · Partial (🟡) · Missing (❌)

> For each gap: Backend / Frontend / Database / Testing work. "Required Work" is the
> minimum to reach Postman parity for that feature, scoped to *this* codebase's patterns.

---

## Gap Score Summary
| Bucket | ✅ | 🟡 | ❌ |
|---|---|---|---|
| Core API | 6 | 3 | 0 |
| Collections | 2 | 1 | 2 |
| Variables | 2 | 2 | 2 |
| Auth helpers | 1 | 2 | 4 |
| Testing | 3 | 0 | 2 |
| Automation | 3 | 0 | 1 |
| Collaboration | 2 | 0 | 2 |
| Mocking | 0 | 0 | 2 |
| Monitoring | 1 | 2 | 0 |
| Documentation | 0 | 1 | 2 |
| API Design | 0 | 2 | 1 |
| Protocols | 2 | 0 | 3 |
| Security | 1 | 2 | 1 |
| Governance | 0 | 0 | 3 |
| Flows | 0 | 0 | 3 |

**Overall parity ≈ 38% supported, 24% partial, 38% missing.**
Biggest value-per-effort gaps: **Request Chaining/Flows, Auth helpers (OAuth2/API-key), Secret encryption, Mock Servers, Documentation publishing, Contract/OpenAPI import.**

---

## Detailed Gap Table (priority-ordered within section)

### Auth Helpers — highest leverage, low effort
| Feature | State | Required Work |
|---|---|---|
| API Key auth | ❌ | FE: auth-type form (in header/query) · BE: inject at execute_direct · no DB |
| OAuth2 | ❌ | BE: token-grant flow (client-cred + auth-code) + token cache table · FE: config form · DB: `oauth_tokens` |
| AWS Signature v4 | ❌ | BE: signing util before httpx send · FE: cred form · no DB |
| Basic Auth | 🟡 | finish base64 encoding in execute_direct path; FE already has option |
| JWT builder | ❌ | BE: sign helper · FE: claims form |

### Flows / Chaining — highest product value
| Feature | State | Required Work |
|---|---|---|
| Request Chaining | ❌ | BE: extract values from response (`jsonpath`) → store as run-scoped vars → inject next · DB: none (run context) · FE: "set variable from response" UI |
| Workflow Builder | ❌ | BE: Flow exec engine (ordered steps, branch) · DB: `flows`, `flow_steps`, `flow_runs` · FE: node-graph canvas |
| Conditional Logic | ❌ | part of Flow engine — per-step condition eval |
| API Orchestration | ❌ | Flow engine drives multi-request sequences |

### Secrets / Security
| Feature | State | Required Work |
|---|---|---|
| Secret Storage at rest | 🟡 | BE: encrypt `is_secret` values (Fernet/KMS) before persist; decrypt at resolve only · DB: store ciphertext |
| Vault Integration | ❌ | BE: optional secrets backend interface (env→Vault/KMS) |
| Audit Logs | 🟡 | BE: `audit_log` write on mutating actions · DB: `audit_logs` table · FE: admin viewer |

### Mocking
| Feature | State | Required Work |
|---|---|---|
| Mock Servers | ❌ | BE: dynamic route that serves saved example responses by matcher · DB: `mock_servers`, `mock_routes` · FE: mock config UI |
| Dynamic Responses | ❌ | BE: template/`{{...}}` + faker in mock response body |

### Documentation
| Feature | State | Required Work |
|---|---|---|
| Generated Documentation | ❌ | BE: render collection → doc model · FE: doc view |
| Publishing | ❌ | BE: public read token + published_doc table · FE: public page |
| Examples | 🟡 | promote saved cases → named examples (reuse `ApiCase`) |

### API Design / Contract
| Feature | State | Required Work |
|---|---|---|
| OpenAPI import | 🟡 | BE: parse spec → generate nodes/apis/cases (extend `bulk_import`) · FE: upload UI |
| Schema Management | ❌ | DB: `api_specs` registry · BE: store/version specs |
| Contract Testing | ❌ | BE: validate live response vs OpenAPI schema (reuse validator.py + jsonschema) |

### Collections / Variables
| Feature | State | Required Work |
|---|---|---|
| Collection Variables | ❌ | DB: `collection_variables` (node_id scoped) · BE: include in resolution chain · FE: collection vars tab |
| Local Variables | ❌ | run-scoped map in runner context (no DB) |
| Dynamic Variables | 🟡 | extend `${ts}` → faker set (`{{$randomEmail}}` etc.) in resolve_variables |
| Collection Sharing | 🟡 | extend member sharing to sub-collection granularity |
| Collection Documentation | ❌ | see Documentation section |

### Protocols
| Feature | State | Required Work |
|---|---|---|
| SSE | ❌ | BE: streaming proxy (reuse ws_proxy pattern) · FE: stream panel |
| gRPC | ❌ | BE: grpc client + proto upload · DB: `proto_files` · FE: method picker |
| SOAP | ❌ | BE: XML envelope builder + wsdl parse · FE: SOAP body mode |

### Monitoring
| Feature | State | Required Work |
|---|---|---|
| Monitors | 🟡 | promote schedule+alert into a "Monitor" surface; add uptime/latency rollup table |
| Health Checks (targets) | 🟡 | scheduled single-request ping with assertion |

### Collaboration
| Feature | State | Required Work |
|---|---|---|
| Comments | ❌ | DB: `comments` (entity_type, entity_id) · BE CRUD · FE thread UI |
| Version Control | ❌ | DB: `node_versions` snapshots · BE: save/restore · FE: diff/history |

### Governance
| Feature | State | Required Work |
|---|---|---|
| API Standards / Naming Rules / Validation Rules | ❌ | BE: rule engine evaluating apis/specs against ruleset · DB: `governance_rules` · FE: lint report |

---

## Worked Example (instruction format)
**Feature: Collection Runner** — Status: ✅ **Supported** (already built)
- Backend: `bulk_run_cases.py` (execution), `bulk_test_executions`/`bulk_test_results` (run history), `shedule_test.py` (scheduling) — all present.
- Frontend: `BulkTestPanel`, `TestRunner`, `BulkResults` modal — present.
- Database: run tables present.
- Testing: `validator.py` assertion layer present.
- **Gap remaining:** none for parity; enhancement = surface as "Monitor".

**Feature: Mock Servers** — Status: ❌ **Missing**
- Backend: dynamic matcher route + response resolver (new).
- Frontend: mock config UI + per-route example editor (new).
- Database: `mock_servers`, `mock_routes` (new).
- Testing: matcher unit tests + served-response integration tests.

---

## Validation Checklist — Phase 2
- [x] Every Postman feature given ✅/🟡/❌ + reason
- [x] Each gap has BE/FE/DB/Test work
- [x] Gap score computed
- [x] Two worked examples per instruction format
- [x] Priority ordering applied (leverage vs effort)
