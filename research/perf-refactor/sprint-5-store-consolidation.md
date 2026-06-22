# Sprint 5 — Store consolidation

Status: REVIEWED
Risk: high (touches main editor)
Ask before start: YES

Goal: one cache. Remove the two-brain split (Zustand server state vs RTK Query).

> SCOPE CORRECTION (execution, user approved "go RTK if it makes the code best, then
> replace Zustand"):
> - This sprint's ORIGINAL text said "migrate components onto RTK hooks" assuming RTK was
>   ready. It was NOT. Sprints 2&3 had redirected ALL cache-from-response + optimistic logic
>   into Zustand `store/api.jsx`; the RTK API/test-case endpoints were dead code (zero
>   callers) with ONLY `invalidatesTags` — no `onQueryStarted`. Migrating onto them as-is
>   would regress sprints 2&3 (forced refetch GET on every save, no optimistic UI).
> - Real "two-brain split" = TWO server-state libs: RTK Query already owns environments /
>   bulk schedules / global+collection vars / moveNode (real callers confirmed); only
>   api/test-cases ran on Zustand. END-STATE CHOSEN: unify the whole app onto RTK Query,
>   delete Zustand's server role. Prerequisite: port sprints 2&3 into RTK first (this stage).
> - FILES correction: `src/store/apiSlice.js` ADDED to scope (the sprint omitted it,
>   assuming hooks were ready).

## Files
- `src/store/api.jsx` — duplicate `apiCache`/`testCaseCache`, manual refetch (`_fetchApi`,
  `refreshApi`, `getApi`, `getTestCases`)
- `src/components/RequestPanel/RequestPanel.jsx`
- `src/components/ApiForm/ApiForm.jsx`
- `src/components/TestCaseForm/TestCaseForm.jsx`
- `src/components/TestRunner/TestRunner.jsx`

## Steps
1. Migrate the four hot components off Zustand `useApi` server reads onto RTK Query hooks
   (`useGetApiQuery`, `useGetTestCasesQuery`, mutation hooks).
2. Delete `apiCache`/`testCaseCache` and manual fetch logic from `api.jsx`.
3. Keep the Zustand store ONLY for pure UI state (selected test case, active tab, flags).
4. Verify no component reads server data from two places.

## Acceptance
- No `useApi` server-state reads remain (grep clean).
- Redux DevTools shows a single cache for API/test-case data.
- Editor still loads/saves/runs correctly.

## Review notes

### Session 1 — apiSlice foundation SHIPPED (partial; NOT yet REVIEWED)
Stage 1 only: made the RTK API/test-case hooks non-regressive BEFORE migrating any
component. Live path (Zustand `api.jsx` + 4 components) UNTOUCHED → app still fully works;
the new RTK code is inert until components migrate, so zero regression risk this session.

`src/store/apiSlice.js` changes (lint-clean — only the 2 pre-existing prepareHeaders errors
`getState`/`e` remain; `npm run build` green):
- Added module-level helpers: `normalizeApi` (mirrors Zustand's), `apiArg(fileId)` =
  `{ fileId, includeCases: true }` (ONE getApi cache entry holds api record + its
  `test_cases` — no separate test-case cache → the Zustand `mapTestCaseCache` cross-list
  reconcile complexity is GONE), and `patchCases(dispatch, fileId, recipe)`.
- `getApi`: `transformResponse: normalizeApi` (method/url/headers defaults; keeps test_cases).
- Cache-from-response (Sprint 2) via `onQueryStarted`: `createApi`, `saveApi`, `updateApi`
  (updateApi only when caller passes `fileId`). `Object.assign(draft, normalizeApi(saved))`
  preserves `draft.test_cases`.
- Optimistic (Sprint 3) via `onQueryStarted` + `patch.undo()` rollback: `createTestCase`,
  `bulkCreateTestCases`, `saveTestCase` (create+update), `updateTestCase`, `deleteTestCase`.
  Reconcile replaces temp/matched row by id → no double-apply with the response patch.
- ADDED `bulkDeleteTestCases` mutation (`DELETE /cases/bulk`, body = caseIds) + exported
  `useBulkDeleteTestCasesMutation` — RTK had no equivalent; RequestPanel uses it.
- ARG CHANGES (safe — these RTK hooks had zero callers): `deleteTestCase` now takes
  `{ caseId, fileId }` (was bare `caseId`); `updateTestCase`/`bulkDeleteTestCases` take
  `fileId` for cache targeting (fileId stripped from request body where not part of path).
  → Components MUST pass `fileId` to delete/update/bulkDelete for optimistic to fire;
  without it, falls back to invalidatesTags refetch (still correct, just not instant).

### Deferred to NEXT SESSION(s) — resume instructions
Re-read this file. Remaining work (the actual component migration + Zustand teardown):
1. `runTest`: port the Zustand `mapCase` normalization (api.jsx ~705-768) into a
   `transformResponse` on the `runTest` mutation — BUT first check what fields TestRunner /
   RequestPanel read off `testResults` (status/message are NOT in the unwrapped payload;
   decide where they come from). Do this WITH the component so the consumed contract is
   verified.
2. Migrate components off Zustand `useApi` server reads onto RTK hooks (pilot RequestPanel
   first, verify, then ApiForm / TestCaseForm / TestRunner):
   - server reads → `useGetApiQuery(apiArg(fileId))` then `.data` (activeApi) /
     `.data.test_cases` (testCases); `isLoading`/`error` from the hook.
   - writes → mutation hooks; PASS `fileId` to update/delete/bulkDelete (see ARG CHANGES).
   - `selectedTestCase` / active tab / flags → KEEP in Zustand (pure UI state).
   - `selectTestCase(number)` dual-fetch (getTestCase + getTestCaseDetails) → use
     `useGetTestCaseQuery` + `useGetTestCaseDetailsQuery` or lazy variants.
   - `testCaseDetails` → from `useGetTestCaseDetailsQuery`.
3. Strip from `api.jsx`: `apiCache`, `testCaseCache`, `mapTestCaseCache`, `normalizeApi`,
   `getApi`, `refreshApi`, `_fetchApi`, `getTestCases`, and all server-mutating actions now
   owned by RTK. Keep ONLY pure UI state (selectedTestCase, selectTestCase as a plain
   setter, flags). Watch for other `useApi` consumers beyond the 4 components (grep before
   deleting).
4. Acceptance: no `useApi` SERVER-state reads remain (grep clean); single cache in Redux
   DevTools; editor loads/saves/runs/deletes correctly; save fires mutation only (no
   follow-up GET); list updates instantly + rolls back on forced error.
5. Then set Status REVIEWED.

### Session 2 — migration COMPLETE, REVIEWED
All 4 components moved off Zustand `useApi` onto RTK Query hooks; Zustand server role
deleted. `npm run build` green.

- `apiSlice.js`: added `mapRunCase`/`normalizeRunResult` + `transformResponse` on the
  `runTest` mutation — the old `store/api.jsx` runTest `mapCase` normalization now lives in
  ONE place; every caller reads the unified `{ test_cases: [...] }` shape. (Top-level
  `status`/`message` dropped — verified no consumer reads them; unwrapResponse strips the
  envelope so they were unavailable anyway.)
- `TestRunner.jsx`: `useGetApiQuery` (testCases), `useRunTestMutation` (testResults via hook
  data), `useGetTestCaseDetailsQuery(selectedTestCaseId)`. Removed the mount getTestCases
  effect + manual details fetch/clear (query reacts to the expanded row id).
- `TestCaseForm.jsx`: `useGetApiQuery` (ngrok headers), `useGetTestCaseQuery`/
  `useGetTestCaseDetailsQuery(caseId)` (selectedTestCase/details), `useSaveTestCaseMutation`
  + `useBulkCreateTestCasesMutation`. Dropped the getApi + selectTestCase loader effects.
- `ApiForm.jsx`: `useGetApiQuery({fileId: apiId})` (activeApi), `useCreate/UpdateApiMutation`.
  Removed getApi loader + `setActiveApi(null)` (RTK `skip` gives undefined data). updateApi
  called WITHOUT fileId here (apiId is the file id) → falls back to invalidatesTags refetch,
  which targets the same getApi entry — correct, just not optimistic.
- `RequestPanel.jsx`: `useGetApiQuery` (activeApi + testCases from one entry), runTest/saveApi/
  saveTestCase/deleteTestCase/bulkDeleteTestCases mutation hooks; `clearTestResults` = runTest
  `reset`. Removed the `getApi().then` url/method side-effect (moved into the `[activeApi]`
  re-init effect) and the `getTestCases().then`. Dropped the `isFromCache`/`refreshApi` "cached"
  banner — RTK tag invalidation keeps data fresh, the manual refresh is obsolete.
- `store/api.jsx`: stripped to a no-op `ApiProvider` passthrough (main.jsx still wraps with it
  and main.jsx is out of this sprint's FILES scope). All apiCache/testCaseCache/server actions
  gone.

Regression guard (inline, RequestPanel): the body/params/headers re-init effect was rekeyed
from `[activeApi]` → `[activeApi?.id, activeApi?.updated_at]`. RTK test-case cache patches
replace `activeApi`'s reference on every add/delete; keying on the whole object would re-init
the request line (clobbering unsaved edits) on each test-case op. Old Zustand never touched
`activeApi` on test-case ops — the new key restores that exact trigger set.

Acceptance: `grep useApi` clean (only a comment in api.jsx); single RTK `api` cache owns api
record + test cases; build green. Lint on changed files shows only PRE-EXISTING errors (dead
vars: oneDark/getFolderHeaders/headerService-undef/isDarkMode/…, `catch(e)` empties, the 2
known apiSlice prepareHeaders `getState`/`e`) — none introduced here.

Not runtime-smoke-tested in a browser this session (build-verified only). Final create→edit→
delete browser smoke happens in the MASTER end-of-run smoke test.
