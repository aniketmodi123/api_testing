# Spec — OpenAPI & Schema Management + Contract Testing + Regression Diff

STATUS: in-progress (backend done; FE missing)
LAST_CHANGED: 2026-06-16
SOURCE: phases/phase_6_openapi_specs/spec.md + phases/phase_7_contract_testing/spec.md

## Goal
Bidirectional OpenAPI import/export, cURL round-trip, live contract testing, run-to-run regression diff. Differentiators X4 + X6.

## Backend (shipped)

### Endpoints
| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST | `/spec/import` | editor | Parse OpenAPI/Swagger → nodes+apis+cases |
| GET | `/spec?workspace_id=` | viewer | List specs |
| GET | `/spec/{id}` | viewer | Detail |
| DELETE | `/spec/{id}` | editor | Delete |
| GET | `/spec/{id}/export` | viewer | Export collection → OpenAPI 3.0 JSON |
| POST | `/curl/to-request` | viewer | Parse cURL → {method, url, headers, body} |
| POST | `/request/to-curl` | viewer | {method, url, headers, body} → cURL string |
| POST | `/spec/{id}/contract-test` | editor | Live responses vs schema → violations |
| GET | `/run/{exec_id}/diff` | viewer | Diff two BulkTestExecution result sets |

## Frontend (missing)
| Component | Purpose |
|---|---|
| SpecImportModal | Upload spec + tree-diff preview of what will be created |
| ContractTestReport | Violations list with path + message |
| RegressionDiffView | Side-by-side diff of two run results |

## Decision Table
| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Parser | pyyaml + hand-rolled path walker | No heavy dep; OpenAPI structure predictable |
| 2 | Import strategy | Extend bulk_import atom | DRY — reuse proven dedup + temp_id logic |
| 3 | Export format | OpenAPI 3.0.3 JSON | Most compat with Postman/Insomnia |
| 4 | cURL parser | Regex + shlex.split | stdlib only, handles quoted strings |
| 5 | Contract persistence | Ephemeral at MVP | Don't add table until UX validated |
| 6 | Diff algorithm | Recursive dict walk | Simple, no dep |
| 7 | Contract concurrency | semaphore=5 | Avoid flooding target |

## Edge Cases
| # | Trap | Fix |
|---|---|---|
| 1 | External `$ref` URLs | Block — any http $ref → 400 |
| 2 | Circular `$ref` | Max-depth 10 + seen-refs set |
| 3 | Swagger 2.0 `basePath` | Normalize to 3.0 shape on parse |
| 4 | Contract: Api not found in workspace | Skip + add to `unmatched` list |
| 5 | Contract: target endpoint down | Mark `unreachable`; continue |
| 6 | Diff: non-JSON body | Diff as raw string equality |
