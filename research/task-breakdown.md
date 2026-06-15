# Phase 12 — Task Decomposition

LAST_UPDATED: 2026-06-15
HIERARCHY: Epic → Feature → Task → Subtask (each subtask independently completable)

> Decomposes the roadmap phases. Foundations + the three highest-value feature phases shown
> in full; remaining phases follow the identical Task template (entity→migration→API→UI→tests).

---

## EPIC A — Platform Foundations

### Feature A1: Alembic Migrations (F0)
- Task A1.1 Add alembic + env config
  - [ ] install, `alembic init`, async env.py
  - [ ] baseline revision stamping current schema
  - [ ] up/down smoke test on test DB
- Task A1.2 CI integration
  - [ ] migration check in pipeline

### Feature A2: Observability (F0)
- Task A2.1 Structured logger
  - [ ] logger module (JSON), replace `print` in security.py/runner
  - [ ] request-boundary log middleware
- Task A2.2 Outbound HTTP client
  - [ ] singleton httpx, pooled, timeout/retry
  - [ ] TLS verify flag (default true)
  - [ ] SSRF guard util (block private CIDR, DNS pin)

### Feature A3: Secrets at Rest (F1)
- Task A3.1 SecretsProvider (Fernet)
  - [ ] encrypt/decrypt util, key from env
- Task A3.2 Migrate env/global secrets
  - [ ] add ciphertext path, backfill, mask responses
  - [ ] tests: never return plaintext

### Feature A4: Audit + RBAC (F2)
- Task A4.1 audit_logs table + write helper
- Task A4.2 `require_role` dependency wrapper for new routers
- Task A4.3 GET /audit (admin)

---

## EPIC B — Auth Helpers (Phase 1)

### Feature B1: Declarative request auth
- Task B1.1 Schema + storage (`Api.extra_meta.auth` or RequestAuth)
  - [ ] Pydantic v1 model per type
  - [ ] PUT /api/{id}/auth
- Task B1.2 Inject at send (execute_direct)
  - [ ] apikey (header/query)
  - [ ] bearer / basic (finish base64)
  - [ ] aws_sig v4 signer
  - [ ] jwt builder
- Task B1.3 OAuth2
  - [ ] oauth_tokens table
  - [ ] client-credentials grant + cache
  - [ ] auth-code grant
  - [ ] refresh on expiry
- Task B1.4 FE AuthBuilder component
- Task B1.5 Tests (signing, fetch+cache, inject, 401/422)

---

## EPIC C — Variables + Flows (Phases 2–5)

### Feature C1: Collection + Local variables
- Task C1.1 collection_variables table + CRUD endpoints
- Task C1.2 Extend resolution chain (global→collection→env→local)
- Task C1.3 /resolve/preview endpoint
- Task C1.4 FE VariableScopePanel collection tab
- Task C1.5 Tests (precedence order)

### Feature C2: Dynamic variables
- Task C2.1 faker token map in resolve_variables (`{{$random*}}`)
- Task C2.2 Tests

### Feature C3: Request chaining
- Task C3.1 jsonpath extract util
- Task C3.2 run-context var store in runner
- Task C3.3 inject extracted vars into subsequent request
- Task C3.4 FE "set var from response" UI
- Task C3.5 Tests

### Feature C4: Flow engine
- Task C4.1 flows/flow_steps/flow_runs/flow_step_results tables
- Task C4.2 Flow CRUD endpoints
- Task C4.3 Exec engine (ordered steps, condition, delay, set_var) — async, own DB session
- Task C4.4 POST /flow/{id}/run + run history endpoints
- Task C4.5 FE FlowCanvas + StepEditor + RunViewer
- Task C4.6 Tests (context passing, branch, failure)

---

## EPIC D — Spec & Contract (Phases 6–7)
- D1 api_specs table + POST /spec/import (extend bulk_import) → nodes/apis/cases
- D2 Spec list/detail endpoints + FE SpecImportModal (preview diff)
- D3 Contract test endpoint (response vs schema, reuse validator) + FE report
- D4 Tests (parse, import idempotency, contract diff)

## EPIC E — Mock Servers (Phase 8)
- E1 mock_servers/mock_routes tables
- E2 Mgmt endpoints + FE MockRouteEditor
- E3 Public serve route `/m/{token}/{path}` (matcher + template + faker + delay)
- E4 Tests (match, no-auth serve, SSRF n/a)

## EPIC F — Documentation (Phase 9)
- F1 Doc render model + generate endpoint
- F2 published_docs + publish endpoint + public token
- F3 FE DocGenerateView + PublicDocPage
- F4 Tests (no secrets rendered)

## EPIC G — Monitoring (Phase 10)
- G1 monitors table + rollup job (uptime/p95 from executions)
- G2 Monitor endpoints + FE dashboard (reuse sparkline)
- G3 Tests (rollup calc)

## EPIC H — Collaboration (Phase 11)
- H1 comments table + CRUD + FE thread
- H2 node_versions snapshot/restore + FE diff
- H3 Tests (restore integrity)

## EPIC I — Protocols (Phase 12)
- I1 SSE proxy (reuse ws_proxy) + FE SSEPanel
- I2 gRPC unary + proto upload + FE panel
- I3 SOAP envelope + wsdl parse + FE body mode
- I4 Tests + SSRF guard

## EPIC J — Governance (Phase 13)
- J1 governance_rules + rule engine
- J2 lint endpoint + FE LintReport
- J3 Tests

---

## Subtask Sizing Rule
Each `[ ]` ≈ ≤1 day, independently testable, single PR. No subtask spans BE+FE+DB in one — split by layer.

---

## Validation Checklist — Phase 12
- [x] Every roadmap phase → Epic→Feature→Task→Subtask
- [x] Subtasks small + independent + layer-split
- [x] Reuse called out (bulk_import, validator, ws_proxy, sparkline)
- [x] No coding (decomposition only)
