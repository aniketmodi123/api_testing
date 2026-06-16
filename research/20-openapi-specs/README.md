# 20-openapi-specs — OpenAPI & Schema Management + Contract Testing + Regression Diff

Status: Partial
Coverage: 55%

## Implemented (backend)
- `ApiSpec` model + migration
- `POST /spec/import` — parse OpenAPI 3.x / Swagger 2.0 → nodes/apis/cases; `$ref` SSRF-blocked
- `GET /spec` list + `GET /spec/{id}` detail + `DELETE /spec/{id}`
- `GET /spec/{id}/export` — collection → OpenAPI 3.0.3 JSON
- `POST /curl/to-request` + `POST /request/to-curl` — cURL round-trip
- `POST /spec/{id}/contract-test` — live responses vs OpenAPI schema (ephemeral)
- `GET /run/{exec_id}/diff?compare_exec_id=` — regression diff between two run results

## Missing
- FE SpecImportModal (tree-diff preview)
- FE ContractTestReport
- FE RegressionDiffView

## Current Task
None (backend done)

## Next Task
FE SpecImportModal

## Dependencies
- 07-collections (import creates nodes)
- 22-security (SSRF on $ref URLs — done)
- 09-collection-runner (regression diff reads bulk_test_results)

## Priority
P1

## Differentiators
X4 — regression diff (Postman: pass/fail only)
X6 — bidirectional cURL ↔ OpenAPI (Postman: one-way lossy)
