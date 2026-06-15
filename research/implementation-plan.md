# Phase 15 — Code Generation Gate / Implementation Plan

LAST_UPDATED: 2026-06-15
STATUS: **Gate OPEN — planning complete, awaiting user approval to begin coding.**

> Produced only after Phases 0–14 complete (see readiness-review.md verdict). Defines the
> exact order of feature, development, migration, testing, and release. **No code is written
> until the user approves this plan.**

---

## Approval Gate
| Precondition | State |
|---|---|
| All 16 planning artifacts complete | ✅ |
| Cross-consistency verified | ✅ |
| Risk matrix + mitigations defined | ✅ |
| Outstanding decisions logged (O1–O5) | ✅ (non-blocking) |
| **User approval to start coding** | ⏳ PENDING |

→ Coding starts only after user says "approved / start Phase F0".

---

## Feature Order (value + dependency)
1. F0 Platform Hardening → F1 Secrets → F2 Audit/RBAC  (foundations)
2. Auth Helpers
3. Variable Scopes → Dynamic Vars → Request Chaining → Flows
4. OpenAPI Import → Contract Testing
5. Mock Servers
6. Documentation
7. Monitoring
8. Collaboration
9. Protocols (SSE→gRPC→SOAP)
10. Governance

## Development Order (per feature, strict)
```
1. Migration (Alembic, up+down)         ← schema first, expand-only
2. ORM model + Pydantic v1 schema
3. Backend endpoint(s) + RBAC + audit + logging
4. Unit + integration tests (happy/auth/invalid)  ← before FE
5. RTK Query endpoint + Zustand state
6. UI component(s) + loading/error/empty
7. E2E smoke
8. Validation gate (V1–V10) → flip MEMORY.md status
```

## Migration Order
```
0  Alembic baseline (stamp current schema)
1  audit_logs
2  secret-encryption columns (env/global expand→backfill→contract)
3  oauth_tokens
4  collection_variables
5  flows, flow_steps, flow_runs, flow_step_results
6  api_specs
7  mock_servers, mock_routes
8  published_docs
9  monitors
10 comments, node_versions
11 governance_rules
```
Rule: each migration is one revision, reversible, never destructive-first.

## Testing Order
```
per feature: unit → integration (DB) → API contract → regression → E2E smoke
gate: regression suite green BEFORE merging each phase
security-critical (secrets/auth/SSRF): 100% branch on guard logic
```

## Release Order (deploy safety)
```
1 Deploy migration (expand) — backward compatible
2 Deploy backend (reads old+new)
3 Backfill job (if needed, e.g. secret encryption)
4 Deploy frontend
5 Contract migration (drop old cols) — only after all instances on new code
Feature-flag risky features (flows, mocks, protocols) for staged rollout.
```

---

## First Concrete Step (on approval)
**Phase F0.A1.1** — Add Alembic, async `env.py`, baseline-stamp current schema, prove up/down on a throwaway DB. Single PR. No feature code. Unblocks every table after it.

---

## Guardrails During Implementation (from CLAUDE.md rules)
- Reuse existing patterns (`create_response`, `get_user_by_username`, `can_access_workspace`, `resolve_variables`, `get_headers`) — never new patterns where one exists.
- Logic in route handlers (match existing) unless a service layer is explicitly approved (F0 runner-service is the one sanctioned exception).
- Pydantic v1 only. `verify=True` default once F0 lands.
- After each change: `graphify update .` + update `research/phases/*` + `research/MEMORY.md`.

---

## Validation Checklist — Phase 15
- [x] Feature / development / migration / testing / release orders defined
- [x] Approval gate explicit (coding blocked on user OK)
- [x] First concrete step named
- [x] Guardrails restated from project rules
- [x] No code generated
