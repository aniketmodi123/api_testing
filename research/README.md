# APIPilot Research — Feature-First Spec Directory

LAST_UPDATED: 2026-06-16
STRUCTURE: Feature-first. Each folder = one self-contained feature specification.

---

## How to Read This Directory

Start here:
1. `FEATURE_INVENTORY.md` — status + coverage of all features
2. `POSTMAN_GAP_ANALYSIS.md` — what's missing vs Postman, priority-ordered
3. `IMPLEMENTATION_ORDER.md` — which features to implement in what order

---

## Feature Folders

Each folder contains exactly 4 files:
- `README.md` — status, coverage %, dependencies, current/next task
- `research.md` — existing code to reuse, patterns, gotchas
- `spec.md` — requirements, API contracts, decisions, edge cases
- `test_matrix.md` — acceptance tests, edge cases, regression

---

## Context Loading Rule (mandatory for subagents)

When working on a feature, load ONLY the 4 files in that feature folder.
Do NOT load the entire research directory or other feature folders.

```
research/<feature-folder>/README.md
research/<feature-folder>/research.md
research/<feature-folder>/spec.md
research/<feature-folder>/test_matrix.md
```

---

## Feature Readiness Gate

Before ANY implementation, the target feature folder MUST have all 4 files.
If any file is missing: STOP and generate documentation first. Do not code.

---

## Directory

| Folder | Feature |
|---|---|
| 01-api-request-builder | Request builder, HTTP methods, URL, headers |
| 02-api-execution-engine | Execute engine, TLS, retry, pooled client |
| 03-response-viewer | Status, body, headers, history |
| 04-variables | Global, collection, env, local, dynamic, scope chain |
| 05-environments | Environment CRUD + active env |
| 06-authentication | All auth types, OAuth2, folder inheritance |
| 07-collections | Node tree, CRUD, bulk import |
| 08-testing | Assertions, validator, schema validation |
| 09-collection-runner | Bulk run, history, results |
| 10-workflows | Flow engine, chaining, conditions, canvas |
| 11-documentation | Doc generation, publishing, public page |
| 12-mock-servers | Mock server, routes, public serve, from-capture |
| 13-monitoring | Uptime, p95, latency series, rollup |
| 14-workspaces | Workspace, members, invites, RBAC |
| 15-collaboration | Comments, threads |
| 16-version-control | Node snapshots, restore |
| 17-graphql | Introspection, GraphQL body mode |
| 18-websocket | WebSocket proxy |
| 19-sse | SSE streaming proxy |
| 20-grpc | gRPC unary (gated on demand) |
| 20-openapi-specs | OpenAPI import/export, cURL round-trip, contract testing, regression diff |
| 21-soap | SOAP (gated on demand) |
| 22-security | SSRF, TLS, CORS, structured logging |
| 23-governance | API linting, naming rules, lint report |
| 24-ai | AI test generation (dropped — re-scope if needed) |
| 25-administration | Meta endpoints, god user, comparison sheet |
| assertions | Assertion engine (see 08-testing) |
| audit-logs | AuditLog model, write_audit, read endpoint |
| alerts | ScheduleAlert, email/webhook firing |
| multi-request-groups | Group execution (via collections + runner) |
| schedules | BulkTestSchedule, cron, scheduler worker |
| secrets-vault | Fernet encryption, vault.py, backfill |
| ssrf-protection | assert_safe_url, all call sites |
| test-cases | ApiCase model, CRUD |
