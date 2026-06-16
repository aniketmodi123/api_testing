# 23 — Governance

Status: Partial
Coverage: 60%

## Implemented (backend)
- `GovernanceRule` model
- GET/POST `/workspace/{id}/governance/rules` — list + create
- PUT/DELETE `/governance/rules/{id}` — update + delete
- `POST /workspace/{id}/governance/lint` — run lint → violations report
- Rule engine: naming (path/name regex), required_field (header/param), status_code

## Missing
- FE GovernanceRules editor
- FE LintReport viewer

## Current Task
None (backend done)

## Next Task
FE GovernanceRules + LintReport

## Dependencies
- 20-openapi-specs (spec as lint target — optional; current lint targets `Api` + `ApiCase` directly)
- audit-logs (admin-only RBAC — done)

## Priority
P2

## Notes
Lint is ephemeral — not stored in DB. Same pattern as contract testing.
