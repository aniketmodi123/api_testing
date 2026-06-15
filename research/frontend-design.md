# Phase 7 — Frontend Design

LAST_UPDATED: 2026-06-15
STACK: React 19 · Vite · RTK Query (server) · Zustand (UI) · Redux (auth) · CodeMirror

> New screens/components for parity. Each lists components, states (loading/error/empty),
> and role-gating. Add RTK Query endpoints in `store/apiSlice.js` (auto-hooks); UI state in Zustand.

---

## Existing Surfaces (recap)
Sidebar/CollectionTree · RequestPanel · ApiForm · TestCaseForm · AssertionBuilder · TestRunner/BulkTestPanel · TestResults(Grid/Card/FocusModal) · EnvironmentManager/Switcher · HeaderEditor · HistoryPanel · WorkspaceSelector/Workspace(Invite) · ImportExport · WebSocketPanel · TabBar · common(Button/JsonEditor).

---

## New Screens & Components

### 1. Auth Builder (RequestPanel tab)
| Item | Detail |
|---|---|
| Component | `AuthBuilder` (replaces inline none/bearer/basic) |
| Types | none · apikey · bearer · basic · oauth2 · aws_sig · jwt |
| States | loading (oauth token fetch) · error (grant failed) · empty (none) |
| Role | editor to edit, viewer read-only |
| Secrets | masked input, never echo stored secret back |

### 2. Variable Scope Manager
| Component | `VariableScopePanel` — tabs: Global / Environment / Collection / (Local read-only at run) |
| New | Collection vars tab bound to selected node |
| States | empty ("no vars"), error, saving |
| Role | editor write |

### 3. Flow Builder
| Component | `FlowCanvas` (node-graph) + `FlowStepEditor` + `FlowRunViewer` |
| States | empty (new flow), running (live step highlight), error (step fail), completed |
| Role | editor build/run, viewer read |
| Notes | step extract UI (jsonpath → var); condition editor |

### 4. Mock Server Manager
| Component | `MockServerList` + `MockRouteEditor` (matcher + response body via CodeMirror) |
| States | empty, saving, error; show public URL |
| Role | editor |

### 5. API Spec / Contract
| Component | `SpecImportModal` (upload OpenAPI) + `ContractTestReport` |
| States | parsing, import-preview (tree diff), error |
| Role | editor |

### 6. Documentation
| Component | `DocGenerateView` + public `PublicDocPage` (unauthenticated route) |
| States | generating, empty, published (show public link) |
| Role | admin to publish |

### 7. Collaboration
| Component | `CommentThread` (attach to node/api/case/flow) + `VersionHistoryPanel` (diff + restore) |
| States | empty thread, loading, error |
| Role | viewer comment, editor restore |

### 8. Monitoring Dashboard
| Component | `MonitorList` + `MonitorDetail` (uptime %, latency sparkline — reuse existing sparkline) |
| States | no-data, loading, error |
| Role | viewer |

### 9. Protocols
| Component | `SSEPanel`, `GraphQLPanel` (exists partial), `SoapBody`, `GrpcPanel` |
| States | connecting, streaming, closed, error |

### 10. Governance / Audit (admin)
| Component | `GovernanceRules` + `LintReport` + `AuditLogTable` |
| Role | admin only |

---

## Global State Conventions
| State kind | Where |
|---|---|
| All server data (flows, mocks, specs, comments...) | RTK Query endpoints + tags in `apiSlice.js` |
| Selected node / active workspace / active env | Zustand stores (existing pattern) |
| Auth/JWT | Redux `authSlice` |
| Run/flow live progress | Zustand ephemeral (or WS subscription) |

## Universal State Patterns (every new screen)
| State | Requirement |
|---|---|
| Loading | skeleton or `GlobalLoader`/`LookingLoader` (exist) |
| Error | inline error banner; surface `error_message` from 206/4xx |
| Empty | explicit empty-state CTA (not blank) |
| Forbidden | hide/disable controls by role; 403 → toast |

---

## UI Navigation Map
```
Login
 └─ App Shell (IconSidebar + WorkspaceSelector + TabBar)
     ├─ Collections (CollectionTree)
     │   ├─ Request (RequestPanel: Params|Headers|Auth*|Body|Tests|Response)
     │   ├─ Variables (Global|Env|Collection*)
     │   ├─ Comments* / Version History*
     │   └─ Docs* (generate/publish)
     ├─ Flows*  (FlowCanvas → FlowRunViewer)
     ├─ Mock Servers*
     ├─ API Specs* (import → contract test)
     ├─ Monitors*  (list → detail)
     ├─ History (existing)
     ├─ Runner / Schedules (existing BulkTestPanel)
     └─ Admin* (Governance | Audit | Members)
PublicDocPage*  (no auth)        Mock serve /m/{token}*  (no auth)
( * = new )
```

---

## Validation Checklist — Phase 7
- [x] Every missing feature → screen + components
- [x] Loading/error/empty states per screen
- [x] Role gating per screen
- [x] State placement (RTK Query vs Zustand vs Redux) follows existing pattern
- [x] Navigation map incl. public routes
- [x] Reuse existing components flagged (sparkline, loaders, JsonEditor)
