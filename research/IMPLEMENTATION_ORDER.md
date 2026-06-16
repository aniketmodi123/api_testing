# Implementation Order

LAST_UPDATED: 2026-06-16

Ordered by dependency. Features with the same level can be parallelized.
Agent rule: load only the feature folder being worked on — do not scan unrelated features.

---

## Level 0 — Foundation (done; no action needed)
These are complete. Listed for dependency tracing only.

| # | Feature | Folder | Why first |
|---|---|---|---|
| F0a | SSRF Protection | ssrf-protection | All proxies depend on it |
| F0b | Security (TLS, CORS, logging) | 22-security | All outbound calls depend on it |
| F0c | Secrets Vault | secrets-vault | Auth + variables depend on encryption |
| F0d | Audit Logs | audit-logs | Collaboration + admin depend on audit |
| F0e | Workspaces + RBAC | 14-workspaces | Every feature is workspace-scoped |
| F0f | Collection Runner | 09-collection-runner | Monitoring + flows depend on runner |
| F0g | Schedules + Alerts | schedules, alerts | Monitoring depends on schedules |
| F0h | Test Cases + Assertions | test-cases, assertions | Runner depends on them |

---

## Level 1 — High Value, Unblocked (implement next)

| Priority | Feature | Folder | Dependency | Why now |
|---|---|---|---|---|
| P1-A | Variables (collection + local + scope chain) | 04-variables | vault.py (done) | Blocks chaining, flow engine, inline preview |
| P1-B | OpenAPI Import (FE modal) | 20-openapi-specs | Backend done | Unblocks contract testing UX + regression diff UX |
| P1-C | Flow Engine (FE canvas) | 10-workflows | Variables (P1-A) | Highest product value; X7 |

---

## Level 2 — High Value, After Level 1

| Priority | Feature | Folder | Dependency | Why |
|---|---|---|---|---|
| P2-A | Monitoring Dashboard (FE) | 13-monitoring | Schedules (done) | X2 differentiator; free advertising point |
| P2-B | Mock Server Manager (FE) | 12-mock-servers | Backend done | X10 differentiator |
| P2-C | Regression Diff View (FE) | 20-openapi-specs | Backend done | X4 differentiator |
| P2-D | Variable Scope Panel + Inline Preview (FE) | 04-variables | Variables P1-A | X3 differentiator |

---

## Level 3 — Collaboration + Docs + Governance

| Priority | Feature | Folder | Dependency | Why |
|---|---|---|---|---|
| P3-A | Comments (FE) | 15-collaboration | Backend done | X9 (collab without seat tax) |
| P3-B | Version History (FE) | 16-version-control | Backend done | Completes collab story |
| P3-C | Documentation + Publishing (FE) | 11-documentation | Backend done | Public docs URL |
| P3-D | Governance Rules + Lint (FE) | 23-governance | Backend done | Org standards |
| P3-E | Audit Log Table (FE) | audit-logs | Backend done | Admin visibility |
| P3-F | SSE Panel (FE) | 19-sse | Backend done | Protocol parity |

---

## Level 4 — Low Priority / Gated

| Priority | Feature | Folder | Gate |
|---|---|---|---|
| P4-A | gRPC | 20-grpc | Confirm real demand first |
| P4-B | SOAP | 21-soap | After gRPC; confirm demand |
| P4-C | AI Test Generation | 24-ai | Dropped — re-scope if needed |
| P4-D | Path Param Binding UI | 01-api-request-builder | Nice-to-have |
| P4-E | Code Snippet Generator | 01-api-request-builder | Nice-to-have |
| P4-F | Per-collection sharing | 07-collections | After Level 3 |

---

## Linear Order (one team, sequential)
```
1  04-variables          — collection vars + scope chain + dynamic tokens + resolve preview (BE)
2  04-variables FE       — VariableScopePanel + InlineVarPreview (X3)
3  10-workflows FE       — FlowCanvas + FlowStepEditor + FlowRunViewer (X7)
4  20-openapi-specs FE   — SpecImportModal + ContractTestReport + RegressionDiffView (X4, X6)
5  13-monitoring FE      — MonitorList + MonitorDetail (X2)
6  12-mock-servers FE    — MockServerList + MockRouteEditor (X10)
7  11-documentation FE   — DocGenerateView + PublicDocPage
8  15-collaboration FE   — CommentThread
9  16-version-control FE — VersionHistoryPanel
10 23-governance FE      — GovernanceRules + LintReport
11 audit-logs FE         — AuditLogTable
12 19-sse FE             — SSEPanel
13 (gated) 20-grpc       — when demand confirmed
14 (gated) 21-soap       — when demand confirmed
```

---

## Context Loading Rule (mandatory)
When working on any feature, load ONLY:
```
research/<feature-folder>/README.md
research/<feature-folder>/research.md
research/<feature-folder>/spec.md
research/<feature-folder>/test_matrix.md
```
Do NOT load FEATURE_INVENTORY.md, POSTMAN_GAP_ANALYSIS.md, or other feature folders during implementation.
