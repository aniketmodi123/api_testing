# Sprint 3 — Optimistic updates on hot paths

Status: REVIEWED
Risk: med
Ask before start: no

Goal: UI updates on click, before the server replies. Roll back on error only.

> SCOPE CORRECTION (execution, user approved "do the best"):
> - Real test-case data layer is Zustand `src/store/api.jsx` (apiService), NOT RTK
>   `apiSlice.js` — same redirect Sprint 2 established (RTK test-case mutations are
>   dead code, zero callers). Optimism applied there.
> - Tree rename/delete lives in `src/store/node.jsx`, a Context store driven by
>   `refreshTrigger` that REFETCHES THE WHOLE TREE (300ms debounce) after every
>   mutation. That refetch clobbers any optimistic patch → optimism is pointless
>   until `refreshTrigger` is removed, which IS Sprint 4. Tree optimism deferred to
>   Sprint 4 (its files, its risk gate). Not touched here.
> Real FILES touched: `src/store/api.jsx` only.

## Files
- `src/store/api.jsx` — optimistic create/edit/delete test case (redirected from
  `apiSlice.js`; see scope note).
- existing error/toast UI (reuse — store `error` state, already rendered — do NOT add a new pattern).

## Pattern (reuse for each)
```js
async onQueryStarted(arg, { dispatch, queryFulfilled }) {
  const patch = dispatch(apiSlice.util.updateQueryData(QUERY, KEY, (draft) => {
    // apply the change optimistically (edit/insert/remove)
  }));
  try { await queryFulfilled; }
  catch { patch.undo(); /* surface existing error toast */ }
}
```

## Steps
1. Add optimistic `updateQueryData` patch for: create/edit/delete test case;
   rename/delete tree node.
2. On `queryFulfilled` reject → `patch.undo()` + show existing error UI.
3. Confirm no double-apply with Sprint 2's response patch (optimistic first, reconcile
   with server entity on fulfill).

## Acceptance
- List/tree updates instantly on click.
- Forced server error (e.g. offline) rolls the change back and shows an error.

## Review notes
- Scope: redirected to Zustand `store/api.jsx` (test cases). Tree optimism deferred to
  Sprint 4 (refreshTrigger refetch would clobber the patch). RTK `apiSlice.js` untouched.
- Made optimistic (apply-now → reconcile-on-fulfill → rollback-on-error): createTestCase,
  bulkCreateTestCases, saveTestCase (create+update), updateTestCase, deleteTestCase,
  bulkDeleteTestCases. Temp ids (`optimistic-<ts>`) for inserts, swapped for the server
  entity on success.
- No double-apply with Sprint 2 reconcile: reconcile REPLACES the temp/matched row by id
  (map), never re-appends. saveTestCase matchId = `caseId ?? tempId`.
- Found + fixed a latent stale-cache clobber: delete/update/create did NOT sync
  `testCaseCache`, but RequestPanel calls `getTestCases(fileId)` after each mutation →
  cache-hit served the stale list and undid the change (deleted rows reappeared). Now
  every test-case mutation keeps `testCaseCache` consistent. id-based mutations
  (update/delete/bulkDelete) lack fileId → reconcile across ALL cached lists via new
  module-local `mapTestCaseCache` helper (guards non-array values to avoid a crash when a
  prior rollback left `cache[fileId] = undefined`).
- Error path: rollback restores prevCases/prevSelected/prevCache and sets store `error`
  (existing error UI — TestCaseForm renders `{error}`; no new toast pattern added).
- `isLoading` kept toggling (backward compat); verified it only disables buttons / swaps
  labels, never hides the test-case list → optimism visible instantly.
- Lint: only the 2 PRE-EXISTING `react-refresh/only-export-components` errors remain
  (useApi + ApiProvider exports). No new lint errors. No frontend test suite yet (Sprint 8).
- Acceptance: list updates instantly on click; forced server error rolls back + shows
  error. Network smoke deferred to MASTER final smoke. DONE → self-reviewed → REVIEWED.
