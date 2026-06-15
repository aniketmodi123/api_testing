# Phase 9 — Test Strategy

LAST_UPDATED: 2026-06-15

> Per project rule: every endpoint ≥ happy path + auth failure + invalid input. Prefer
> integration tests at DB layer over mocks. Test behavior + response contract, not internals.

---

## Test Layers
| Layer | Tool (suggested) | Scope |
|---|---|---|
| Unit | pytest | pure helpers: resolve_variables (incl. new scope chain), auth signing, jsonpath extract, secret enc/dec |
| Integration | pytest + httpx ASGITransport + test PG | router → DB round-trip per endpoint |
| API contract | schema assert on `{response_code,data,message,error_message}` | every endpoint |
| E2E | Playwright (frontend) | key flows: build→send, runner, flow run, mock serve |

---

## Per-Feature Test Matrix (new work)
| Feature | Unit | Integration | API | E2E |
|---|---|---|---|---|
| Auth helpers (oauth/apikey/aws/jwt) | signing/encoding correctness | token fetch+cache, inject on send | 200/401/422 | send authed request |
| Collection/local variables | scope precedence order | CRUD + resolve preview | 200/403/404 | resolve in request |
| Secret encryption | enc/dec roundtrip, key rotation | store ciphertext, never return plaintext | masked in response | secret hidden in UI |
| Flows / chaining | extract jsonpath, condition eval | create→run→step results, context passing | 201 run / 403 | build+run flow |
| Mock servers | matcher logic, template render | route match + served response | public serve no-auth | hit mock URL |
| OpenAPI import | spec parse → node tree | import generates apis/cases | preview diff | upload spec |
| Contract testing | response vs schema diff | run against live | report shape | view report |
| Documentation/publish | render model | generate + publish token | public read | view public page |
| Comments/versions | snapshot/restore integrity | CRUD + restore | thread shape | comment+restore |
| Monitors | uptime/p95 calc | rollup from executions | list shape | dashboard renders |
| Protocols (sse/grpc/soap) | envelope/stream parse | proxy round-trip | stream frames | live stream UI |
| Governance/audit | rule eval; audit write | lint report; audit query | admin-only 403 | admin views |

---

## Mandatory Cases per Endpoint
| Case | Expectation |
|---|---|
| Happy path | 200/201 + correct `data` |
| Auth failure | missing/blacklisted token → 401 |
| RBAC failure | viewer on write → 403 |
| Invalid input | bad schema → 422 |
| Not found | unknown id → 206 (project quirk) + `error_message` |
| SSRF guard (proxy endpoints) | private-CIDR target → blocked |

---

## Regression Suite (must not break)
| Existing feature | Guard test |
|---|---|
| run_case / bulk_run | existing assertions still pass |
| scheduler next_run calc | schedule fires at correct time |
| header inheritance merge | root→leaf override preserved |
| variable resolution ({{VAR}}, ${ts}) | unchanged for env/global |
| workspace member invite/join/role | RBAC unchanged |
| request history capture | still records |

---

## Coverage Requirements
| Area | Target |
|---|---|
| New backend endpoints | 100% have happy+auth+invalid; ≥80% line |
| Security-critical (secrets, auth, SSRF) | 100% branch on guard logic |
| Runner/flow engine | ≥85% |
| Frontend critical flows | E2E smoke per surface |

## Success Criteria
- No new endpoint merged without its 3 mandatory tests.
- Regression suite green before each phase "Done".
- Secret never appears in any test-captured response body.

---

## Validation Checklist — Phase 9
- [x] Test layers defined with tooling
- [x] Per-feature matrix (unit/integration/api/e2e)
- [x] Mandatory per-endpoint cases incl. 206 + SSRF
- [x] Regression suite listed
- [x] Coverage + success criteria set
