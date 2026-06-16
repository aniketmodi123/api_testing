# Research Gaps Log

CREATED: 2026-06-16

## Progress
| # | Feature | Folder | Status | New Gaps Found |
|---|---|---|---|---|
| 1 | Variables | 04-variables | done | 33 gaps (FE components ×6, full dynamic var catalog ~40 tokens vs 3 specced, data scope deferred, initial/current value model deferred, nested `{{}}` edge case, key validation rule, reveal endpoints ×2, 13 new test cases for highlighting/autocomplete) |
| 2 | Workflows / Flows | 10-workflows | done | 11 gaps found (FE canvas lib, 9 missing block types, 3 trigger types, run viewer, loop engine types, webhook endpoint, 15 UNVERIFIED items flagged) |
| 3 | OpenAPI Specs + Contract + Diff | 20-openapi-specs | pending | — |
| 4 | Monitoring | 13-monitoring | pending | — |
| 5 | Mock Servers | 12-mock-servers | pending | — |
| 6 | Documentation + Publishing | 11-documentation | pending | — |
| 7 | Collaboration (Comments) | 15-collaboration | pending | — |
| 8 | Version Control (Snapshots) | 16-version-control | pending | — |
| 9 | Governance | 23-governance | pending | — |
| 10 | Audit Logs | audit-logs | pending | — |
| 11 | SSE | 19-sse | pending | — |
| 12 | Authentication | 06-authentication | pending | — |
| 13 | Collections | 07-collections | pending | — |
| 14 | Testing (Assertions + Validation) | 08-testing | pending | — |
| 15 | API Request Builder | 01-api-request-builder | pending | — |
| 16 | Environments | 05-environments | pending | — |
| 17 | Collection Runner | 09-collection-runner | pending | — |
| 18 | Workspaces | 14-workspaces | pending | — |
| 19 | GraphQL | 17-graphql | pending | — |
| 20 | WebSocket | 18-websocket | pending | — |
| 21 | Assertions | assertions | pending | — |
| 22 | Test Cases | test-cases | pending | — |
| 23 | Schedules | schedules | pending | — |
| 24 | Secrets Vault | secrets-vault | pending | — |
| 25 | Alerts | alerts | pending | — |
| 26 | Administration | 25-administration | pending | — |
| 27 | Multi-Request Groups | multi-request-groups | pending | — |

## New Gaps (features APIPilot is missing entirely)
| Feature | Gap | Severity | Add to FEATURE_INVENTORY? |
|---|---|---|---|
| 10-workflows | FE FlowCanvas not built; canvas library now decided (React Flow) | High | No — already in feature |
| 10-workflows | Engine missing loop/collect/evaluate/log step types | High | No — already in feature |
| 10-workflows | Webhook trigger endpoint (POST /flow/webhook/{token}) not specified or built | High | No — add to spec backlog |
| 10-workflows | Scheduled trigger integration with flow not built (flow trigger config endpoints missing) | Medium | No — add to spec backlog |
| 10-workflows | FlowRunViewer live canvas overlay (block status overlaid on canvas) not specified | Medium | No — add to spec backlog |
| 10-workflows | Port type system (typed handles + connection validation) not in existing spec | Medium | No — added to spec.md |
| 10-workflows | Flow-level variables panel not in existing FE spec | Medium | No — added to spec.md |
| 10-workflows | FlowTriggerConfig component (trigger type UI) not in existing FE spec | Medium | No — added to spec.md |
| 10-workflows | send_request() extraction from execute_direct still pending (blocks all engine work) | Critical | No — T2 prerequisite |
| 10-workflows | Optimistic lock / conflict detection on flow save not specified | Low | No — add to spec edge cases |
| 10-workflows | Postman Flows plan gating details unverified — differentiator claim needs live validation | Low | No — flag for product |
