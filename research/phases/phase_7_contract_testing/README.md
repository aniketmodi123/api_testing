# Phase 7 — Contract Testing + Regression Diff (differentiator X4)

**Status:** not-started (stub)
**Phase:** 7
**Depends on:** Phase 6 (specs)
**Estimated scope:** full-stack · M

## What the user sees
Validate live responses against the OpenAPI schema (contract testing). Plus **regression diff** —
compare this run's responses to the previous run and highlight exactly what changed (differentiator
X4; Postman shows pass/fail but weak run-to-run diff).

## Deliverables
- [ ] `POST /spec/{id}/contract-test` — response vs schema (reuse validator.py + jsonschema)
- [ ] Regression diff: this run vs last run from `bulk_test_results` snapshots
- [ ] FE ContractTestReport + RegressionDiffView
- [ ] Tests: schema mismatch detected, diff correctness

## Tasks → Subtasks (this is a STUB — do T0 first)
- [ ] T0 Scaffold spec.md + research.md + test_matrix.md from this README + root docs
- [ ] T1 `POST /spec/{id}/contract-test` — response vs schema (reuse validator.py + jsonschema)
- [ ] T2 Regression diff: this run vs last run from `bulk_test_results` snapshots
- [ ] T3 FE ContractTestReport + RegressionDiffView (X4)
- [ ] T4 Tests: schema mismatch detected, diff correctness

## Reuse
`routers/runner/validator.py` (assertions), `bulk_test_results` (request/response snapshots already stored), TestResults FE components.

## Definition of Done
Contract mismatches flagged with path; regression diff shows added/removed/changed fields vs prior run.
