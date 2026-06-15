# Phase 14 — AI Assist — test-case + assertion generation (differentiator X1)

**Status:** not-started (stub)
**Phase:** 14
**Depends on:** Phase 6 (specs), Phase 4 (variables)
**Estimated scope:** full-stack · L

## What the user sees
Point at an endpoint or OpenAPI operation → AI generates test cases + assertions automatically
(differentiator X1; Postman's Postbot is paid + cloud-only). Leverages the project's existing JSON
test-case generation guidelines (already in git history / commit `eadfd5b`).

## Deliverables
- [ ] AI service wrapper (Claude API) — model `claude-opus-4-8` / `claude-sonnet-4-6` per cost
- [ ] `POST /ai/generate-cases` — endpoint/spec → `ApiCase` rows (name, params, body, expected)
- [ ] Prompt grounded in repo's existing JSON case-format guidelines
- [ ] FE "Generate with AI" action in TestCaseForm; review-before-save
- [ ] Tests: generated cases match `ApiCase` schema; human approves before persist

## Tasks → Subtasks (this is a STUB — do T0 first)
- [ ] T0 Scaffold spec.md + research.md + test_matrix.md from this README + root docs
- [ ] T1 AI service wrapper (Claude API; key from env, never logged; model claude-opus-4-8/claude-sonnet-4-6 per cost)
- [ ] T2 `POST /ai/generate-cases` — endpoint/spec → ApiCase rows; prompt grounded in repo JSON case guidelines
- [ ] T3 FE "Generate with AI" in TestCaseForm; review-before-save (human approves before persist)
- [ ] T4 Tests: generated cases match ApiCase schema; nothing persists without approval

## Reuse
Existing JSON test-case guidelines (commit eadfd5b / `3669cb7`), `ApiCase.expected` schema, AssertionBuilder. Use latest Claude models; never hardcode API key (env only).

## Definition of Done
From an endpoint, AI proposes valid runnable cases + assertions; user edits/approves; saved as normal cases. Key from env, no secret in logs.
