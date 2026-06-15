# Trackers — Progress · Decisions · Assumptions · Risks · Dependencies

LAST_UPDATED: 2026-06-15

> Living document. Update after every phase/decision. Satisfies master-instruction rules 9–13.

---

## 1. Progress Tracker (planning)
| Phase | Artifact | Status |
|---|---|---|
| 0 | project-overview.md | ✅ done |
| 1 | current-features.md | ✅ done |
| 2 | postman-gap-analysis.md | ✅ done |
| 3 | architecture-review.md | ✅ done |
| 4 | domain-model.md | ✅ done |
| 5 | database-design.md | ✅ done |
| 6 | api-design.md | ✅ done |
| 7 | frontend-design.md | ✅ done |
| 8 | security-review.md | ✅ done |
| 9 | testing-strategy.md | ✅ done |
| 10/11 | implementation-roadmap.md | ✅ done |
| 12 | task-breakdown.md | ✅ done |
| 13 | validation-framework.md | ✅ done |
| 14 | readiness-review.md | ✅ done |
| 15 | implementation-plan.md | ✅ done (gate open, awaiting approval) |

**Implementation progress:** not started — blocked on user approval.

---

## 2. Decision Log
| # | Decision | Choice | Reason |
|---|---|---|---|
| DL1 | Where to put strategic docs | flat files in `research/` root | matches master-instruction filenames; keeps existing `phases/`+`project/` intact |
| DL2 | Reuse existing phases 0–7 | yes, as foundation | already done (UI, history, vars, test, monitoring, collab, protocols) |
| DL3 | Migration tool | Alembic, before any new table | `create_all` cannot do safe ALTER/destructive |
| DL4 | Secrets at rest | Fernet (env key) MVP → KMS/Vault later | minimal, reversible, unblocks auth features |
| DL5 | Declarative auth storage | `Api.extra_meta.auth` MVP (avoid new table) | additive, no migration for MVP |
| DL6 | Flow engine | in-process async first | avoid premature queue infra; revisit at scale (O2) |
| DL7 | Follow existing layering | logic in route handlers | CLAUDE.md rule; one sanctioned service = runner-service in F0 |
| DL8 | Keep response wrapper + 206 quirk for now | yes | backward compat; standardization deferred (O3) |
| DL9 | JS test/pre-request scripts (pm.* sandbox) | **out of scope** — declarative assertions + AI gen instead | avoids code-exec security surface; AI case-gen (phase_14) is the differentiator vs Postman scripting |
| DL10 | Roadmap layout | phase_0..15 folders, full detail 0-5, stub 6-15 | user removed old done phases; fresh numbering |
| DL11 | Differentiators | weave X1-X10 into phases, each parity feature ships its edge | goal = beat Postman, not clone (see differentiators.md) |

---

## 3. Assumptions Log
| # | Assumption | Impact if wrong |
|---|---|---|
| AS1 | PostgreSQL is prod DB (asyncpg) | migration/index plan changes |
| AS2 | Single API + single scheduler process | flow/scheduler need leader-lock at scale (R4) |
| AS3 | Pydantic stays v1 until explicit migration | new schemas must use v1 validators |
| AS4 | Phases 0–7 marked "done" actually ship working | gap analysis statuses may shift |
| AS5 | No external secrets manager available yet | Fernet MVP acceptable |
| AS6 | gRPC/SOAP have real demand | may deprioritize (O5) |
| AS7 | `workspace_id` integers are reliable refs despite no FK | data-integrity edge cases |

---

## 4. Risk Register (from architecture + security reviews)
| ID | Risk | Sev | Mitigation | Phase |
|---|---|---|---|---|
| R1 | No migrations blocks new tables | Critical | Alembic | F0 |
| R2/S1 | Plaintext secrets leak | Critical | encrypt at rest | F1 |
| R3/S3 | verify=False MITM | High | TLS flag default-on | F0 |
| R4 | Double scheduler/flow runs | High | leader lock / SKIP LOCKED | F0/C4 |
| R5/D4 | Unbounded history/results | High | retention + partition | F0 |
| S10 | SSRF via runner/mock/proxy | High | CIDR allow/deny, DNS pin | F0 |
| R6/S4 | CORS open | Med | restrict origins | F0 |
| R7/S6 | print logging | Med | structured logger | F0 |
| S7 | No action audit | High | audit_logs | F2 |
| R9/AS3 | Pydantic v1 EOL | Med | planned v2 window | later |

---

## 5. Dependency Graph
```
F0 (Alembic, logger, http client, SSRF, CORS)
 ├─► F1 (secrets at rest)
 │     └─► 1 Auth Helpers (oauth_tokens)
 ├─► F2 (audit + RBAC ext)
 │     ├─► 9 Documentation (publish)
 │     └─► 11 Collaboration (comments/versions)
 ├─► 2 Variable Scopes ─► 3 Dynamic Vars
 │                       └─► 4 Request Chaining ─► 5 Flows
 ├─► 6 OpenAPI Import ─► 7 Contract Testing
 │                     └─► 13 Governance
 ├─► 8 Mock Servers
 ├─► 10 Monitoring (also reuses existing scheduler)
 └─► 12 Protocols (SSE→gRPC→SOAP)   [needs F0 SSRF guard]
```
Critical path: **F0 → F1 → Auth / Variables → Flows** (highest value, deepest chain).

---

## Validation Checklist — Trackers
- [x] Progress tracker (planning + impl)
- [x] Decision log
- [x] Assumptions log
- [x] Risk register (cross-linked to reviews)
- [x] Dependency graph + critical path
