# 24 — AI (Test Case Generation)

Status: DROPPED
Coverage: N/A

## Implemented
None

## Missing
- AI service wrapper (Claude API)
- `POST /ai/generate-cases` — endpoint/spec → `ApiCase` rows
- FE "Generate with AI" action in TestCaseForm (review-before-save)

## Current Task
None — scope dropped by user decision (2026-06-16)

## Next Task
N/A — dropped from scope

## Dependencies
- 20-openapi-specs (spec as input for generation)
- 08-testing (ApiCase schema)

## Priority
DROPPED — user request

## Notes
Phase 14 (AI Assist) was explicitly dropped from scope per user decision 2026-06-16.
Can be re-scoped if needed. Differentiator X1 removed from active roadmap.

## If Re-scoped
- Use `claude-sonnet-4-6` for cost efficiency; `claude-opus-4-8` for quality
- Key from env `ANTHROPIC_API_KEY` — never log, never hardcode
- Ground prompt in repo's existing JSON test-case generation guidelines (commit eadfd5b)
- Human approval gate before any ApiCase is persisted
