# Phase 13 — Validation Framework

LAST_UPDATED: 2026-06-15

> Pass/Fail criteria each feature must meet across five dimensions before its phase is "Done".
> Used as the gate checklist during implementation (Phase 15+).

---

## Five Validation Dimensions
| Dimension | Asks |
|---|---|
| Functional | Does it do what the user expects, end-to-end? |
| Backend | Correct contract, RBAC, error handling, logging, query cost? |
| Frontend | Loading/error/empty states, role gating, no secret exposure? |
| Database | Migration up/down, indexes, FK cascade, retention? |
| Security | Secrets encrypted, SSRF guarded, audited, no plaintext leak? |

---

## Generic Pass/Fail Gate (every feature)
| # | Criterion | Pass = |
|---|---|---|
| V1 | Endpoints return wrapped `{response_code,data,message,error_message}` | always |
| V2 | Happy + auth-fail + invalid-input tests exist & green | all 3 present |
| V3 | RBAC enforced (`can_access_workspace`/`require_role`) | 403 on under-privileged |
| V4 | Mutating action writes audit_log | row created |
| V5 | Any secret encrypted at rest + masked in response | no plaintext anywhere |
| V6 | Migration reversible (up/down) | both succeed on clean DB |
| V7 | List endpoints paginated (default 50/max 200) | enforced |
| V8 | Proxy/runner endpoints SSRF-guarded | private CIDR blocked |
| V9 | FE shows loading/error/empty | all 3 rendered |
| V10 | Regression suite green | no existing test breaks |

---

## Per-Feature Validation Specifics
| Feature | Functional | Backend | Frontend | Database | Security |
|---|---|---|---|---|---|
| Auth helpers | authed request succeeds vs protected target | each type injects correctly | AuthBuilder per type | oauth_tokens ciphertext | tokens never logged/returned |
| Variable scopes | precedence resolves correctly | chain order deterministic | scope tabs save | collection_variables unique(node,key) | secret vars encrypted |
| Request chaining | value flows step→step | jsonpath extract robust to missing | set-var UI | run-context (no leak) | secrets masked in results |
| Flows | multi-step run completes/branches | engine async, own session | canvas run highlight | flow_* cascade | run audited |
| Mock servers | public URL serves matched response | matcher precedence | route editor | mock_routes index | unguessable token + rate-limit |
| OpenAPI import | spec → correct node tree | idempotent re-import | preview diff | api_specs stored | `$ref` SSRF blocked |
| Contract testing | mismatch detected | reuse validator | report renders | — | — |
| Documentation | doc reflects collection | render correct | public page | published_docs token | no secrets rendered |
| Monitoring | uptime/p95 accurate | rollup correct | dashboard | monitors link schedule | — |
| Collaboration | comment thread + restore work | snapshot integrity | diff view | node_versions cascade | author/admin only delete |
| Protocols | stream/call works | SSRF-guarded proxy | live panel | proto storage | private CIDR blocked |
| Governance | lint flags violations | rule eval correct | report | governance_rules | admin only |

---

## Phase-Done Definition (binds roadmap + DoD)
A phase is **Done** only when: all V1–V10 pass for its endpoints **AND** the per-feature row passes **AND** docs updated **AND** `research/MEMORY.md` status flipped.

---

## Validation Checklist — Phase 13
- [x] Five dimensions defined
- [x] Generic V1–V10 gate
- [x] Per-feature functional/backend/frontend/database/security criteria
- [x] Pass/Fail explicit
- [x] Bound to roadmap Definition-of-Done
