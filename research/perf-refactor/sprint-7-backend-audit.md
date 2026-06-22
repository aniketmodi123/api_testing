# Sprint 7 — Backend API audit to SDE-3 (GENERATOR PHASE)

Status: TODO
Risk: scoped per domain
Ask before start: YES

Goal: cover "every api" on the backend per the global CLAUDE.md SDE-3 rules.
Backend = 23 router domains, 94 files. Too big for one session — this sprint is a
GENERATOR: it audits ONE domain per session and emits `sprint-7-<domain>.md` subtasks.

## How this sprint runs (per session, one domain)
1. Read `sprint-7-progress` table below. Pick the FIRST domain not `REVIEWED`.
2. `cavecrew-investigator` → map that domain's routes (file:line, what each does).
3. Audit each route against the checklist (below). Score with the 100-pt rubric.
4. Fix only routes below target (≥85/100). Stay inside that domain's files.
5. Verify (run backend, hit the routes, or run the domain's tests from Sprint 8).
6. Mark the domain row REVIEWED, write findings under Review notes. STOP. Ask for next.

## Per-route checklist (from global CLAUDE.md)
- [ ] `create_response()` + Pydantic schema on ALL success paths
- [ ] Correct HTTP status codes (200/201/204/400/401/403/404/409/422/500)
- [ ] Auth via `Depends()` before any DB access; access scope checked before query
- [ ] Query efficiency: no N+1, only needed fields, `in_([])` guarded, dynamic filters
- [ ] Error paths return safe message, no stack-trace/DB-internal leak
- [ ] Response schema verified vs actual query output (types, Optional, no extra/missing keys)
- [ ] Logging on error paths only, with context (username, key, error)
- [ ] Full type hints; no bare `dict` at inter-layer boundaries

## Domain order (highest risk / hottest first)
Auth + access + data-write paths first; read-only/utility last.

| # | Domain (`backend/src/routers/<d>`) | Why priority | Status |
|---|------------------------------------|--------------|--------|
| 1 | auth + sso + oauth2                | security, token/login | REVIEWED |
| 2 | workspace + node                   | core data, access scope | TODO |
| 3 | api + api_cases                    | hot path (the lag fix's backend) | TODO |
| 4 | environment + variables            | secrets/vars, write path | TODO |
| 5 | runner                             | executes user requests, SSE/WS | TODO |
| 6 | headers                            | write path | TODO |
| 7 | governance + audit + monitor       | compliance/logging | TODO |
| 8 | spec + flow + meta                 | import/contract logic | TODO |
| 9 | mock                               | serve + crud | TODO |
| 10| collab + history                   | versions/comments | TODO |
| 11| docs + themes + script + shedulers | utility/read | TODO |

## Acceptance (per domain)
- Every route in the domain: checklist green, score ≥ 85/100.
- Subtask file `sprint-7-<domain>.md` written with findings + fixes applied.

## Review notes
- **Domain 1 (auth+sso+oauth2) — REVIEWED 2026-06-22.** 11 routes; 2 oauth2 already
  strong, 9 sso routes fixed to ~98. Key bugs: 206-on-failure silent-success
  (change/forgot-password), login `finally: commit` after rollback, delete_user success
  under `error_message` key, `ExceptionHandler` not returned. Status codes corrected
  (404/409/403/200), schemas added on all success paths. Full findings:
  `sprint-7-auth.md`. App assembles, all routes mount; no live-DB test (Sprint 8).
