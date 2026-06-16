# Spec — Testing (Assertions + Validation)

STATUS: stable (existing assertions done; contract testing deferred to 20-openapi-specs)
LAST_CHANGED: 2026-06-16

## Current State
`validator.py` handles all declarative assertions. No JS sandbox planned (out of scope per differentiators.md — AI generation replaces script authoring).

## Contract Testing (deferred — see 20-openapi-specs)
`POST /spec/{id}/contract-test` — validate live responses against OpenAPI schema. Reuses `validator.py` + jsonschema. Spec in `20-openapi-specs/spec.md`.

## Decision Table
| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | JS sandbox | Out of scope | Heavy dep (deno/quickjs); AI generation (24-ai) covers test authoring use case |
| 2 | Contract testing location | 20-openapi-specs feature | Requires OpenAPI spec as input — belongs with spec feature |
