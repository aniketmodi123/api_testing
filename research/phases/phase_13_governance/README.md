# Phase 13 — Governance — API standards, naming & validation rules

**Status:** not-started (stub)
**Phase:** 13
**Depends on:** Phase 6 (specs)
**Estimated scope:** full-stack · M

## What the user sees
Define org rules (naming conventions, required fields, validation rules) and lint collections/specs
against them — a violations report. Matches Postman's API governance.

## Deliverables
- [ ] `governance_rules` table (ruleset per workspace)
- [ ] Rule engine evaluating apis/specs against ruleset
- [ ] `GET/PUT /governance/rules` (admin), `POST /governance/lint` → report
- [ ] FE GovernanceRules + LintReport
- [ ] Tests: rule eval correctness, admin-only

## Tasks → Subtasks (this is a STUB — do T0 first)
- [ ] T0 Scaffold spec.md + research.md + test_matrix.md from this README + root docs
- [ ] T1 `governance_rules` model + migration (ruleset per workspace)
- [ ] T2 Rule engine evaluating apis/specs against ruleset
- [ ] T3 `GET/PUT /governance/rules` (admin) + `POST /governance/lint` → report
- [ ] T4 FE GovernanceRules + LintReport
- [ ] T5 Tests: rule eval correctness, admin-only

## Reuse
`api_specs` (phase_6), validator patterns, admin RBAC (phase_2).

## Definition of Done
Lint flags naming/validation violations with location; rules editable by admins only.
