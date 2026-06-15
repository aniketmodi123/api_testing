# Research MEMORY — Polaris API Testing Project

One line per research folder. Format: `path | status | summary`

---

## Strategic Roadmap (Postman parity — root docs, read README.md first)

```
README.md                   | done | Index + how to read the roadmap
project-overview.md         | done | Phase 0 — current state report
current-features.md         | done | Phase 1 — feature inventory matrix
postman-gap-analysis.md     | done | Phase 2 — gap score + required work
architecture-review.md      | done | Phase 3 — debt, abstractions, risk matrix
domain-model.md             | done | Phase 4 — entities (existing + new)
database-design.md          | done | Phase 5 — tables, indexes, migrations
api-design.md               | done | Phase 6 — new endpoints + contracts
frontend-design.md          | done | Phase 7 — screens, states, nav map
security-review.md          | done | Phase 8 — findings by severity
testing-strategy.md         | done | Phase 9 — test layers + matrix
implementation-roadmap.md   | done | Phase 10/11 — phased roadmap + order
task-breakdown.md           | done | Phase 12 — epic→task decomposition
validation-framework.md     | done | Phase 13 — pass/fail gates
readiness-review.md         | done | Phase 14 — completeness verdict (READY)
implementation-plan.md      | gate | Phase 15 — code-gen gate, awaiting approval
trackers.md                 | live | progress/decisions/assumptions/risks/deps
differentiators.md          | done | X1-X10 edges to beat Postman (not just match)
coding-style-guide.md       | done | House style — code must look user-written, not AI
```

---

## Project Knowledge (existing codebase)

```
project/architecture    | stable   | Tech stack, DB models, auth pattern, response format
project/runner          | stable   | How test execution, bulk run, retry/backoff works
project/scheduler       | stable   | Cron scheduler process, next_run calculation
project/variables       | stable   | {{VAR}} resolution, environment, header inheritance
```

## Phases (Postman-parity roadmap — executable, dependency-ordered)

Old phase_0..7 (done features: UI, history, test-power, monitoring, collab, GraphQL/WS) removed
by user — those ship in the live codebase; status captured in current-features.md.
Full detail (README+spec+research+test_matrix) for phase_0..5; phase_6..15 = README stub (full spec written when phase starts).

```
phases/phase_0_platform_hardening    | full | Alembic, structured logging, pooled TLS client, SSRF guard, CORS
phases/phase_1_secrets_vault         | full | Encrypt secrets at rest (X5 self-hosted vault)
phases/phase_2_audit_rbac            | full | audit_logs + require_role gate (S7)
phases/phase_3_auth_helpers          | full | apikey/oauth2/aws/jwt/basic, folder-inherited (X8)
phases/phase_4_variable_scopes       | full | global→collection→env→local chain, dynamic tokens, live preview (X3)
phases/phase_5_flows                 | full | chaining + orchestration engine + canvas (X7)
phases/phase_6_openapi_specs         | stub | OpenAPI import/export, cURL round-trip (X6)
phases/phase_7_contract_testing      | stub | response-vs-schema + regression diff vs last run (X4)
phases/phase_8_mock_servers          | stub | mock from captured responses (X10)
phases/phase_9_documentation         | stub | generate + publish public docs
phases/phase_10_monitoring           | stub | scheduler-native uptime/p95 monitors, free/unlimited (X2)
phases/phase_11_collaboration        | stub | comments + version control (X9 no seat tax)
phases/phase_12_protocols            | stub | SSE → gRPC → SOAP
phases/phase_13_governance           | stub | naming/validation rule engine + lint
phases/phase_14_ai_assist            | stub | AI test-case + assertion generation (X1)
phases/phase_15_differentiator_polish| stub | make side-by-side beat Postman (X1-X10 audit)
```

Build order = phase number. Coding starts only after implementation-plan.md gate approved.
