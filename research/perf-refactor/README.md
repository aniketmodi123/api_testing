# perf-refactor — task scaffolding (TEMPORARY)

Goal: fix frontend mutation lag and rebuild the API/data layer to SDE-3 quality.
Full design lives in the approved plan; this folder is the execution board.

## Why this folder exists
Path B execution: every sprint is a self-contained task file so any fresh session
resumes by reading one file + `STATUS.md` instead of re-tracing the codebase.

## Lifecycle per task
```
TODO → (do work) → DONE → (self-review diff) → if problem: fix → re-review → REVIEWED
```
When EVERY task is `REVIEWED` and the app verifies end-to-end → **delete this whole
folder**. It is scaffolding, not docs.

## Session rules
- Major sprint (1, 4, 5, 7) → ask the user before starting.
- Small task inside an approved sprint → proceed without asking.
- After editing code, keep the sprint file's Status + Review notes current.

## Core principle (the fix)
> A mutation already returns the updated entity. Patch the cache from the response,
> show it optimistically, roll back on error. Refetch only the single affected entity
> (id-granular tag) — never the whole list or tree.

## How to run (every session)
Paste the content of `MASTER.md` at the start of a new session. It runs the next
un-REVIEWED sprint, marks it, then stops. One sprint per session.

## Files
- `MASTER.md` — the orchestrator prompt. Entry point. Paste this each session.
- `STATUS.md` — board, single source of truth, one row per sprint.
- `sprint-0..7-*.md` — one task each (FILES / STEPS / ACCEPTANCE). Run via MASTER.
