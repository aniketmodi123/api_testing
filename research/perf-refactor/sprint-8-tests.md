# Sprint 8 — Test coverage (infra + tests)

Status: TODO
Risk: med
Ask before start: YES

Goal: no tests exist (frontend or backend). Add infra, then coverage so the lag fix +
SDE-3 rebuild can't regress. Per CLAUDE.md: every endpoint = happy + auth-fail +
invalid-input; prefer integration at the DB layer over mocks.

Split into sub-phases (one per session if needed).

## 8a — Frontend test infra
Files: `frontend/package.json`, `frontend/vitest.config.*`, `frontend/src/test/setup.*`
- Add `vitest` + `@testing-library/react` + `jsdom` + `msw` (mock the API boundary).
- Add `"test"` script. One smoke test green before moving on.

## 8b — Frontend cache-behavior tests (guards the lag fix)
Files: `frontend/src/store/*.test.js`
- Test the win conditions from Sprints 1–4, so they can't silently regress:
  - mutation patches cache from response → NO follow-up GET fired (assert via msw).
  - optimistic update applies, then rolls back on forced server error.
  - id-granular invalidation: editing item A does not refetch item B's query.
  - `unwrapBackendResponse` unit tests (206 no-vars, /variables, /environments, error).

## 8c — Backend test infra
Files: `backend/tests/conftest.py`, `backend/pytest.ini` (or pyproject), test DB fixture
- Add `pytest` + `pytest-asyncio` + `httpx.AsyncClient` against the FastAPI app.
- Test DB fixture (transactional rollback per test). Auth helper to mint a test token.

## 8d — Backend endpoint tests (drives + verifies Sprint 7)
Files: `backend/tests/<domain>/test_*.py`
- Per audited domain (Sprint 7 order): happy path + auth failure (401/403) + invalid
  input (422) for each route. Integration against the test DB, not mocks.
- Run alongside each Sprint 7 domain so audit fixes are proven.

## Acceptance
- `npm run test` (frontend) + `pytest` (backend) both green in CI-able form.
- Cache-behavior tests fail if a mutation refetches the whole list (regression guard).
- Each Sprint 7 domain ships with its endpoint tests.

## Review notes
(filled at review)
