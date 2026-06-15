# Phase 2 — Audit + RBAC Extension — forensic trail + uniform access gate

**Status:** not-started
**Phase:** 2
**Depends on:** Phase 0 (Alembic)
**Estimated scope:** backend-only · M

---

## What the user sees after this is done
Admins get an audit log of who did what (create/update/delete) in a workspace. Every new
endpoint enforces workspace roles uniformly. Closes security gap S7 (no action audit).

## Deliverables
- [ ] `audit_logs` table + append-only write helper `write_audit(...)`
- [ ] `require_role(min_role)` dependency wrapper reusing `can_access_workspace`
- [ ] Mutating endpoints (existing critical + all new) write an audit row
- [ ] `GET /audit` (admin-only, paginated)
- [ ] Retention/partition plan (monthly, 90-day default)

## Tasks → Subtasks (execute in order; each subtask = one PR ≤1 day)
> Detail in spec.md / reuse in research.md. Check off when its test_matrix rows pass.

### T1 — Audit table + helper   [files: models.py, common_querys.py, alembic]   [done when: H1 green]
- [ ] T1.1 `AuditLog` model + migration (monthly partition, 90d retention)
- [ ] T1.2 `write_audit(db, ...)` helper (same txn as mutation)

### T2 — Role gate   [files: security/deps.py]   [reuse: can_access_workspace]   [done when: require_role tests green]
- [ ] T2.1 `require_role(min_role)` FastAPI dependency wrapping `can_access_workspace`

### T3 — Wire mutations   [files: node/*, api_cases/*, workspace/*]   [done when: H1,E1,R1,R2 green]
- [ ] T3.1 Call `write_audit` on create/update/delete in existing critical routers
- [ ] T3.2 Audit god-user actions explicitly

### T4 — Read endpoint   [files: routers/audit.py, main.py]   [done when: H2,X2 green]
- [ ] T4.1 `GET /audit?workspace_id=&limit=&offset=` admin-only, paginated
- [ ] T4.2 Register router + import AuditLog in main.py

## AI agent files
| File | Purpose |
|---|---|
| spec.md | Backend changes, decisions, edge cases |
| research.md | Existing code to reuse |
| test_matrix.md | Acceptance tests |
