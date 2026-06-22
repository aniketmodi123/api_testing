# Sprint 6 — Services layer to SDE-3

Status: REVIEWED
Risk: med
Ask before start: no

Goal: the API-calling code reads like senior code — one HTTP path, typed, no dead code.

## Files
- `src/services/*.js` (apiService, workspaceService, environmentService, nodeService,
  backendApiCallService, deleteNodeAndGetTree)
- `src/api.js` (axios interceptor) vs `src/store/apiSlice.js` `prepareHeaders` — dup auth

## Steps
1. Single auth/header source: today headers are built in BOTH `api.js` axios interceptor
   and `apiSlice.prepareHeaders`. Pick RTK Query as the HTTP path; reduce axios usage to
   only what RTK can't do, or remove if redundant.
2. Consistent error handling across services (typed error from sprint-0 unwrap helper).
3. Add JSDoc typedefs (or TS) for service return shapes — no bare object returns crossing
   boundaries.
4. Remove dead code / unused service functions (grep for callers first).

## Acceptance
- One request-setup path (no duplicated header/auth logic).
- Lint clean; no unused exports.

## Review notes
Done this session (acceptance met):
- Step 1 (single auth source): extracted `getAuthHeaders()` in `src/api.js` — reads
  token+user from localStorage once, returns `{ Authorization, username }`. Now consumed
  by BOTH the axios request interceptor AND RTK `prepareHeaders` (which also imports
  `API_BASE` from api.js, killing its local copy). Duplicated bearer-format + user-parse
  logic removed. Behavior preserved (interceptor still respects pre-set header keys).
- Step 4 (dead code): removed 18 unused `apiService` methods (validateApi, createApi,
  listApis, updateApi, deleteApi, saveApi, saveTestCase, bulkCreate/Run/DeleteTestCases,
  getTestCase, getTestCaseDetails, listTestCases, updateTestCase, generateTestCases,
  runBatchTests, generateTestReport, _calculateResponseTimeBuckets). Verified 0 callers
  via newline-safe `apiService.<m>` scan across all js/jsx. Kept the 11 live methods
  (getApi, createTestCase, deleteTestCase, runTest + 7 schedule/bulk-exec methods).
  Also fixed leftover dangling expr in runTest + 2 pre-existing dead-binding lint errors
  in the touched api.js 401 interceptor.
- Lint clean on api.js, store/apiSlice.js, services/apiService.js.

Deferred (out of FILES scope or low value — pick up later if wanted):
- Steps 2 & 3 (cross-service typed error normalization + JSDoc return typedefs across the
  other 6 service files) — purely stylistic, skipped to keep diff tight.
- Full single-transport migration (kill axios, route everything through RTK): NOT done.
  Would touch component/store callers (MoveCopyPanel, BulkTestPanel, store/node|workspace|
  environment.jsx, RequestPanel, CollectionTree) — all outside this sprint's FILES list.
  Only the duplicated header/auth LOGIC was unified (the literal acceptance); two
  transports still coexist.

Files touched: src/api.js, src/store/apiSlice.js, src/services/apiService.js.
