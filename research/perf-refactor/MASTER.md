# MASTER — perf-refactor orchestrator

> PASTE THIS FILE'S CONTENT AT THE START OF EACH NEW SESSION.
> It is a runnable prompt. Folder: `research/perf-refactor/` (spec/planning lives here only; code lives in `frontend/src/`).

You are running a multi-sprint frontend refactor (fix mutation lag, rebuild API layer
to SDE-3). State lives in `STATUS.md`. Do EXACTLY this, then stop:

1. Read `STATUS.md`. Find the FIRST sprint whose Status != REVIEWED.
   - If NONE remain → run the final smoke test (create→edit→delete across tree, request
     panel, test cases, environments) + full test suite (`npm run test`, `pytest`).
     If clean → DELETE the `perf-refactor/` folder. Stop.
2. Open that sprint file (`sprint-N-*.md`). Check its PRECONDITION (previous = REVIEWED).
   If the sprint header says "Ask before start: YES" → ask the user before touching code.
3. Execute it: follow STEPS, REUSE the noted code, stay INSIDE its FILES list. Edit nothing else.
4. Verify ACCEPTANCE.
5. Set that sprint `Status: DONE` → self-review the diff → if clean set `Status: REVIEWED`;
   write Review notes; update the row in `STATUS.md`.
6. STOP. Report what changed in 3–5 lines. Tell the user to start a NEW session for the
   next sprint. DO NOT start the next sprint in this session.

## Session breaking (keep context small)
- ONE sprint per session. Always stop after one.
- If a big sprint (4, 5) fills context mid-way → stop, set `Status: DONE` with a
  "partial: <where>" Review note, ask the user to resume next session. Next session
  re-reads the sprint file + Review note and continues.

## When to use a subagent vs inline
- Locate code first → `cavecrew-investigator`.
- Mechanical repeated edits across many files (Sprint 3 optimistic blocks, Sprint 6
  service cleanup) → `cavecrew-builder`, ≤2 files per dispatch.
- Review the finished diff → `cavecrew-reviewer`.
- Risky central single-file logic (Sprint 4 tree, Sprint 5 editor) → do it INLINE yourself,
  no subagent.

## Hard rules
- `STATUS.md` is the single source of truth. Never skip updating it.
- Never edit a file outside the active sprint's FILES list.
- Lint changed files before marking DONE. Leave pre-existing unrelated errors untouched.

## Progress (mirror of STATUS.md, quick glance)
- Sprint 0 Foundation — REVIEWED
- Sprint 1 Granular tags — REVIEWED
- Sprint 2 Cache from response — REVIEWED (redirected to store/api.jsx)
- Sprint 3 Optimistic updates — TODO  ← next
- Sprint 4 Tree cache (ask) — TODO
- Sprint 5 Store consolidation (ask) — TODO
- Sprint 6 Services SDE-3 — TODO
- Sprint 7 Backend audit (ask, generator: 11 domains, one per session) — TODO
- Sprint 8 Test coverage / infra (ask) — TODO
