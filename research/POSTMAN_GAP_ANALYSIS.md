# Postman Gap Analysis

LAST_UPDATED: 2026-06-16
SCALE: ✅ Supported · 🟡 Partial · ❌ Missing · ⬆ Beats Postman

---

| Feature | Current State | Postman Equivalent | Missing Capabilities | Priority |
|---|---|---|---|---|
| **Core API** | | | | |
| Request Builder | 🟡 Partial | Full | Path param binding UI | P2 |
| HTTP Methods | ✅ Supported | Full | — | — |
| URL Builder + Var Resolve | ✅ Supported | Full | — | — |
| Query Params | ✅ Supported | Full | — | — |
| Headers | ✅ Supported | Full | — | — |
| Request Body (JSON/form/url-enc) | ✅ Supported | Full | Binary upload | P3 |
| cURL Import | ✅ Supported | Full | — | — |
| Code Snippet Generator | ❌ Missing | Has it | Generate curl/httpie/etc snippets | P3 |
| **Authentication** | | | | |
| Bearer Token | ✅ Supported | Full | — | — |
| API Key (header/query) | ✅ Supported ⬆ | Partial | — | — |
| Basic Auth | ✅ Supported | Full | — | — |
| OAuth2 (client cred) | ✅ Supported | Full | Auth-code redirect deferred | P3 |
| AWS Signature v4 | ✅ Supported | Full | — | — |
| JWT Builder | ✅ Supported | Full | — | — |
| Folder-Inherited Auth | ✅ Supported ⬆ | Shallow only | More levels than Postman (X8) | — |
| **Variables** | | | | |
| Global Variables | ✅ Supported | Full | — | — |
| Environment Variables | ✅ Supported | Full | Per-entry is_secret | P1 |
| Collection Variables | 🟡 Partial | Full | Endpoints not wired (model exists) | P1 |
| Local Variables | ❌ Missing | Has it | Run-scoped vars (needed for chaining) | P1 |
| Dynamic Variables | 🟡 Partial | Full | Only `${ts}`; `{{$uuid}}` etc missing | P1 |
| Secret Variables | 🟡 Partial ⬆ | Cloud vault only | At-rest encryption done; env entry flag missing | P1 |
| Live Var Preview | 🟡 Partial ⬆ | Hover only | `/resolve/preview` backend done; FE missing | P1 |
| **Collections** | | | | |
| Collection Tree | ✅ Supported | Full | — | — |
| Move/Copy Nodes | ✅ Supported | Full | — | — |
| Bulk Import | ✅ Supported | Full | — | — |
| Collection Variables Tab | ❌ Missing | Has it | FE only; backend done | P1 |
| Per-Collection Sharing | 🟡 Partial | Full | Workspace-level only | P2 |
| **Testing** | | | | |
| Assertions | ✅ Supported | Full | — | — |
| Schema Validation | ✅ Supported | Full | — | — |
| Test Scripts (JS) | ❌ Missing | Has it | Out of scope (AI replaces it) | — |
| Contract Testing | 🟡 Partial ⬆ | Limited | Backend done; FE missing; beats Postman on regression diff | P1 |
| Regression Diff | ✅ Supported ⬆ | Weak (pass/fail only) | FE missing (X4) | P1 |
| **Runner** | | | | |
| Collection Runner | ✅ Supported | Full | — | — |
| Scheduled Runs | ✅ Supported | Full | — | — |
| Request Chaining | ❌ Missing | Has it | Local vars + jsonpath extract (in workflows/flows) | P1 |
| **Flows / Orchestration** | | | | |
| Flow Engine | 🟡 Partial ⬆ | Paid/limited | Backend done; FE canvas missing (X7) | P1 |
| Conditional Logic | 🟡 Partial ⬆ | Paid | Backend done; FE missing | P1 |
| **Collaboration** | | | | |
| Workspaces | ✅ Supported | Full | — | — |
| Unlimited Members | ✅ Supported ⬆ | Per-seat pricing | No seat tax (X9) | — |
| Comments | 🟡 Partial | Full | Backend done; FE missing | P2 |
| Version Control | 🟡 Partial | Full | Backend done; FE missing | P2 |
| **Mock Servers** | | | | |
| Mock Servers | 🟡 Partial ⬆ | Limited | Backend done; FE missing; beats on from-capture (X10) | P2 |
| Dynamic Responses | 🟡 Partial | Full | `{{$uuid}}` done via resolve_variables | P2 |
| **Monitoring** | | | | |
| Monitors | 🟡 Partial ⬆ | Paid/limited | Backend done; FE missing; free+unlimited (X2) | P2 |
| Alerts (email/webhook) | ✅ Supported | Full | — | — |
| **Documentation** | | | | |
| Doc Generation | 🟡 Partial | Full | Backend done; FE missing | P2 |
| Publishing | 🟡 Partial | Full | Backend done; FE missing | P2 |
| **API Design / OpenAPI** | | | | |
| OpenAPI Import | ✅ Supported ⬆ | One-way/lossy | Backend done; FE modal missing; bidirectional (X6) | P1 |
| OpenAPI Export | ✅ Supported ⬆ | Limited | Done | — |
| cURL Round-Trip | ✅ Supported ⬆ | One-way | Both directions done (X6) | — |
| Schema Management | 🟡 Partial | Full | FE missing | P1 |
| **Advanced Protocols** | | | | |
| GraphQL | ✅ Supported | Full | Variables tab FE | P3 |
| WebSocket | ✅ Supported | Full | — | — |
| SSE | 🟡 Partial | Full | Backend done; FE missing | P2 |
| gRPC | ❌ Missing | Has it | Gated on demand | P3 |
| SOAP | ❌ Missing | Has it | Gated on demand | P3 |
| **Security** | | | | |
| Secret Vault | 🟡 Partial ⬆ | Cloud only | At-rest encryption done; self-hosted (X5) | P0 |
| RBAC | ✅ Supported | Full | — | — |
| Audit Logs | 🟡 Partial | Paid | Backend done; FE missing | P2 |
| SSRF Protection | ✅ Supported ⬆ | Not present | All proxies guarded | — |
| **Governance** | | | | |
| API Naming Rules | 🟡 Partial | Paid | Backend done; FE missing | P2 |
| Lint Report | 🟡 Partial | Paid | Backend done; FE missing | P2 |

---

## Overall Gap Score
| Bucket | ✅ | 🟡 | ❌ |
|---|---|---|---|
| Total features tracked | 18 | 25 | 7 |

**Parity: ~36% fully supported, ~50% partial (mostly FE missing), ~14% missing**

---

## Biggest FE-Only Gaps (backend done, just need UI)
1. OpenAPI import modal (SpecImportModal)
2. Flow canvas + step editor (FlowCanvas + FlowStepEditor)
3. Variable scope panel + inline preview (VariableScopePanel + InlineVarPreview)
4. Monitor dashboard (MonitorList + MonitorDetail)
5. Mock server manager (MockServerList + MockRouteEditor)
6. Documentation publish UI (DocGenerateView + PublicDocPage)
7. Regression diff view (RegressionDiffView)
8. Comment thread (CommentThread)
9. Version history panel (VersionHistoryPanel)
10. Audit log table (AuditLogTable)
11. SSE panel (SSEPanel)
12. Governance rules editor + lint report (GovernanceRules + LintReport)

---

## Differentiators vs Postman
| Edge | Status | Note |
|---|---|---|
| X2 Unlimited monitors (free) | ✅ Backend | FE missing |
| X3 Live var preview inline | 🟡 Backend done | FE missing |
| X4 Regression diff | ✅ Backend | FE missing |
| X5 Self-hosted vault | ✅ | Done |
| X6 Bidirectional cURL↔OpenAPI | ✅ Backend | FE modal missing |
| X7 Flow engine (free) | 🟡 Backend | FE canvas missing |
| X8 Folder-inherited auth | ✅ | Done |
| X9 No seat tax | ✅ | Done |
| X10 Mock from capture | ✅ Backend | FE missing |
