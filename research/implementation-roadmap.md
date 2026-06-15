# Phase 10 & 11 — Implementation Roadmap + Order

LAST_UPDATED: 2026-06-15

> Small phases, one feature family each, dependency-ordered. Each phase: Prerequisites,
> Tasks, Validation, Definition of Done. **Coding begins only after Phase 15 gate.**
> Existing `research/phases/0-7` (done) are the foundation this roadmap builds on.

---

## Foundation (do FIRST — blocks most feature work)
### Phase F0 — Platform Hardening
**Prereqs:** none. **Why first:** new tables + secrets depend on it.
**Tasks:** Alembic adoption (baseline stamp) · structured logger (kill `print`) · outbound httpx singleton w/ TLS flag + SSRF guard · CORS restrict (prod).
**Validation:** migration up/down works; logs structured; verify=True default; private-CIDR blocked.
**DoD:** all four merged + regression green.

### Phase F1 — Secrets at Rest
**Prereqs:** F0 (migrations). **Tasks:** SecretsProvider (Fernet) · encrypt env/global secret values (expand→migrate→contract) · ensure no plaintext returned.
**Validation:** secret stored ciphertext; resolve decrypts; response masked.
**DoD:** S1/S5 closed; regression green.

### Phase F2 — Audit + RBAC extension
**Prereqs:** F0. **Tasks:** `audit_logs` table + write helper · apply `can_access_workspace` gate to all *new* endpoint stubs · audit read endpoint.
**DoD:** mutations audited; admin-only read enforced.

---

## Feature Phases (dependency-ordered)

| # | Phase | Prereqs | Core deliverable |
|---|---|---|---|
| 1 | **Auth Helpers** | F1 | apikey/bearer/basic/oauth2/aws/jwt request auth + `oauth_tokens` |
| 2 | **Variable Scope Completion** | F1 | collection vars + local(run) vars + resolve preview |
| 3 | **Dynamic Variables** | 2 | faker tokens (`{{$randomEmail}}`) extend resolve |
| 4 | **Request Chaining** | 2 | extract jsonpath→run var, inject next (runner context) |
| 5 | **Flows / Orchestration** | 4 | flows/flow_steps/flow_runs + exec engine + canvas UI |
| 6 | **OpenAPI Import + Schema Mgmt** | F0 | `api_specs` + import→nodes (extend bulk_import) |
| 7 | **Contract Testing** | 6 | live response vs schema (reuse validator) |
| 8 | **Mock Servers** | F0 | mock_servers/mock_routes + public serve |
| 9 | **Documentation + Publish** | F2 | doc render + published_docs + public page |
| 10 | **Monitoring** | none (reuses scheduler) | monitors rollup + dashboard |
| 11 | **Collaboration (Comments + Versions)** | F2 | comments + node_versions + diff/restore |
| 12 | **Protocols (SSE → gRPC → SOAP)** | F0 (SSRF guard) | streaming + grpc + soap |
| 13 | **Governance** | 6 | rule engine + lint report |

---

## Optimal Implementation Order (linearized)
```
F0 Platform Hardening      ← unblocks everything
F1 Secrets at Rest         ← unblocks all auth/secret features
F2 Audit + RBAC ext        ← unblocks collab/admin
1  Auth Helpers
2  Variable Scope          ┐
3  Dynamic Variables       ├ variable track
4  Request Chaining        │
5  Flows / Orchestration   ┘ (highest product value)
6  OpenAPI Import          ┐
7  Contract Testing        ┘ spec track
8  Mock Servers
9  Documentation + Publish
10 Monitoring
11 Collaboration
12 Protocols (SSE,gRPC,SOAP)
13 Governance
```
Rationale: hardening + secrets are hard prerequisites; auth + variables + flows deliver the
biggest Postman-parity value early; mocks/docs/monitoring/collab are independent and can
parallelize once foundations land; protocols + governance are lower-frequency, last.

---

## Per-Phase Template (applied to all above)
```
Phase X — <name>
Prerequisites: <phases>
Tasks: entity → migration → API → UI → tests
Validation Checklist:
  [ ] migration up/down
  [ ] endpoints have happy+auth+invalid tests
  [ ] RBAC gated
  [ ] secrets encrypted (if any)
  [ ] audit written (if mutating)
  [ ] regression green
Definition of Done: feature usable end-to-end in UI + all checks pass + docs updated
```

---

## Validation Checklist — Phase 10/11
- [x] Work split into small single-family phases
- [x] Each phase: prereqs, tasks, validation, DoD
- [x] Dependency order linearized with rationale
- [x] Foundations (migrations/secrets/audit) sequenced first
- [x] Parallelizable tracks identified
