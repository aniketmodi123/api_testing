# Feature Inventory

LAST_UPDATED: 2026-06-16 (post-research pass #19–27)

| # | Feature | Folder | Status | Coverage |
|---|---|---|---|---|
| 1 | API Request Builder | 01-api-request-builder | Partial | 75% |
| 2 | API Execution Engine | 02-api-execution-engine | Partial | 80% |
| 3 | Response Viewer | 03-response-viewer | Complete | 85% |
| 4 | Variables | 04-variables | Partial | 60% |
| 5 | Environments | 05-environments | Complete | 80% |
| 6 | Authentication (Request Auth) | 06-authentication | Complete | 90% |
| 7 | Collections | 07-collections | Partial | 70% |
| 8 | Testing (Assertions + Validation) | 08-testing | Partial | 65% |
| 9 | Collection Runner | 09-collection-runner | Complete | 90% |
| 10 | Workflows / Flows | 10-workflows | Partial | 50% |
| 11 | Documentation + Publishing | 11-documentation | Partial | 40% |
| 12 | Mock Servers | 12-mock-servers | Partial | 50% |
| 13 | Monitoring | 13-monitoring | Partial | 50% |
| 14 | Workspaces | 14-workspaces | Complete | 90% |
| 15 | Collaboration (Comments) | 15-collaboration | Partial | 40% |
| 16 | Version Control (Snapshots) | 16-version-control | Partial | 40% |
| 17 | GraphQL | 17-graphql | Missing | 5% |
| 18 | WebSocket | 18-websocket | Partial | 20% |
| 19 | SSE | 19-sse | Partial | 60% |
| 20 | gRPC | 20-grpc | Missing | 0% |
| 21 | SOAP | 21-soap | Missing | 0% |
| 22 | Security (SSRF + TLS + CORS) | 22-security | Partial | 75% |
| 23 | Governance | 23-governance | Partial | 60% |
| 24 | AI Test Generation | 24-ai | Missing | 0% |
| 25 | Administration | 25-administration | Partial | 60% |
| 26 | OpenAPI Specs + Contract + Diff | 20-openapi-specs | Partial | 55% |
| 27 | Audit Logs | audit-logs | Partial | 60% |
| 28 | Secrets Vault | secrets-vault | Partial | 70% |
| 29 | SSRF Protection | ssrf-protection | Complete | 95% |
| 30 | Schedules | schedules | Partial | 50% |
| 31 | Alerts | alerts | Partial | 40% |
| 32 | Assertions | assertions | Partial | 60% |
| 33 | Test Cases | test-cases | Partial | 55% |
| 34 | Multi-Request Groups | multi-request-groups | Partial | 50% |
| 35 | Request Examples | test-cases | Missing | 0% |

## Summary by Status
| Status | Count | Features |
|---|---|---|
| Complete | 8 | Response Viewer, Environments, Authentication, Collection Runner, Workspaces, SSRF Protection (GraphQL/WebSocket/Schedules/Alerts/Assertions/Test Cases downgraded after research) |
| Partial | 22 | API Request Builder, Execution Engine, Variables, Collections, Testing, Workflows, Documentation, Mock Servers, Monitoring, Collaboration, Version Control, SSE, Security, Governance, Administration, OpenAPI Specs, Audit Logs, Secrets Vault, Multi-Request Groups, WebSocket, Schedules, Alerts, Assertions, Test Cases |
| Missing | 5 | gRPC, SOAP, AI, GraphQL (dedicated client), Request Examples |
| Dropped | 1 | AI Test Generation (user decision 2026-06-16) |

## Overall Parity Score
Backend parity: ~65%
Frontend parity: ~55% (many backend-complete features have no FE yet)
