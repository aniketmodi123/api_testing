# Polaris — Postman-Parity Research & Roadmap

Strategic gap-analysis + implementation roadmap to bring this API testing platform to Postman
feature parity. **Planning only — no code until `implementation-plan.md` is approved.**

## Read in order
| # | Doc | What |
|---|---|---|
| 0 | [project-overview.md](project-overview.md) | Current state: stack, arch, auth, modules, quirks |
| 1 | [current-features.md](current-features.md) | Feature inventory matrix (Existing/Partial/Missing) |
| 2 | [postman-gap-analysis.md](postman-gap-analysis.md) | Gap score + required work per feature |
| 3 | [architecture-review.md](architecture-review.md) | Debt, anti-patterns, missing abstractions, risk matrix |
| 4 | [domain-model.md](domain-model.md) | Entities (existing + new) |
| 5 | [database-design.md](database-design.md) | Tables, indexes, migrations |
| 6 | [api-design.md](api-design.md) | New endpoints + contracts |
| 7 | [frontend-design.md](frontend-design.md) | Screens, states, nav map |
| 8 | [security-review.md](security-review.md) | Findings by severity + remediation |
| 9 | [testing-strategy.md](testing-strategy.md) | Test layers + matrix |
| 10/11 | [implementation-roadmap.md](implementation-roadmap.md) | Phased roadmap + order |
| 12 | [task-breakdown.md](task-breakdown.md) | Epic→Feature→Task→Subtask |
| 13 | [validation-framework.md](validation-framework.md) | Pass/fail gates |
| 14 | [readiness-review.md](readiness-review.md) | Completeness verdict |
| 15 | [implementation-plan.md](implementation-plan.md) | Code-gen gate (awaiting approval) |
| — | [trackers.md](trackers.md) | Progress · decisions · assumptions · risks · deps |
| — | [differentiators.md](differentiators.md) | X1–X10 edges to **beat** Postman, not just match |
| — | [coding-style-guide.md](coding-style-guide.md) | House style — code must read as user-written |

## Executable roadmap (build top-down)
`research/phases/phase_0..15/` — one folder per phase. phase_0..5 have full
README+spec+research+test_matrix; phase_6..15 have a README stub (full spec written at phase start).
Build order = phase number. See [phases/](phases/) and the Phases block in [MEMORY.md](MEMORY.md).

| Phase | Folder | Edge |
|---|---|---|
| 0 | platform_hardening | — (foundation) |
| 1 | secrets_vault | X5 self-hosted vault |
| 2 | audit_rbac | — |
| 3 | auth_helpers | X8 inherited auth |
| 4 | variable_scopes | X3 live var preview |
| 5 | flows | X7 chaining/orchestration |
| 6 | openapi_specs | X6 bidirectional import |
| 7 | contract_testing | X4 regression diff |
| 8 | mock_servers | X10 mock from captures |
| 9 | documentation | — |
| 10 | monitoring | X2 free unlimited monitors |
| 11 | collaboration | X9 no seat tax |
| 12 | protocols | SSE/gRPC/SOAP |
| 13 | governance | — |
| 14 | ai_assist | X1 AI case generation |
| 15 | differentiator_polish | X1–X10 audit |

## Relationship to existing research
`research/project/architecture` remains the detailed existing-codebase knowledge base. The old
done-feature phase folders (UI, history, test-power, monitoring, collab, protocols) were removed —
that functionality already ships; its status lives in [current-features.md](current-features.md).

## Headline
~38% Postman parity today (strong core: request/collections/variables/runner/scheduler/
collab/GraphQL+WS). Biggest gaps: secrets-at-rest, auth helpers, flows/chaining, mock servers,
docs publishing, contract/OpenAPI. Critical path: **Alembic → secrets → auth/variables → flows.**

**Status: planning complete. Awaiting approval to start Phase F0.**
