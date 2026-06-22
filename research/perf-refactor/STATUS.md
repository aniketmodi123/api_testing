# STATUS — perf-refactor board

Status values: TODO | DONE | REVIEWED

| Sprint | Title                              | Risk     | Status | Ask before? |
|--------|------------------------------------|----------|--------|-------------|
| 0      | Foundation (no behavior change)    | low      | REVIEWED | no        |
| 1      | Granular invalidation tags         | low-med  | REVIEWED | yes       |
| 2      | Cache update from mutation response| med      | REVIEWED | no (redirected to store/api.jsx — see sprint file) |
| 3      | Optimistic updates on hot paths    | med      | REVIEWED | no (redirected to store/api.jsx; tree deferred to Sprint 4 — see sprint file) |
| 4      | Kill refreshTrigger, tree into cache| med-high| REVIEWED | yes |
| 5      | Store consolidation                | high     | REVIEWED | yes |
| 6      | Services layer to SDE-3            | med      | REVIEWED | no (auth logic unified in api.js getAuthHeaders; 18 dead apiService methods removed; full axios→RTK migration deferred — touches callers outside FILES) |
| 7      | Backend audit to SDE-3 (generator, per-domain) | scoped | TODO | yes |
| 8      | Test coverage (infra + tests)      | med      | TODO   | yes         |

Sprint 7 is a generator: audits ONE domain per session (11 domain groups, see its
table), emits `sprint-7-<domain>.md` subtasks. Not REVIEWED until all its domains are.

When all = REVIEWED → smoke test create→edit→delete across tree / request panel /
test cases / environments → run full test suite green → then delete the
`perf-refactor/` folder.
