# Sprint 2 — Cache update from mutation response (kill the refetch GET)

Status: REVIEWED
Risk: med
Ask before start: no

> SCOPE CORRECTION (discovered at execution): the live data layer for RequestPanel /
> TestCaseForm is the Zustand store `src/store/api.jsx` (→ `apiService`), NOT the RTK
> `apiSlice.js`. The RTK saveApi/createApi/saveTestCase/env-var mutations have ZERO
> callers in `src/`, so `onQueryStarted` on them would be dead code and kill no GET.
> The real second round-trip is the store's `getApi`/`getTestCases` refetch after a
> save in RequestPanel. Redirected this sprint to the real layer (user approved).
> Real FILES touched: `src/store/api.jsx`, `src/components/RequestPanel/RequestPanel.jsx`.
> TestCaseForm has no post-save refetch (only a mount-time getApi) — left untouched.

Goal: drop the second network round-trip. Mutation already returns the saved entity.

## Files
- `src/store/apiSlice.js` — add `onQueryStarted` to: `saveApi`, `createApi`,
  save/update/delete test case, env-var writes.
- `src/components/RequestPanel/RequestPanel.jsx` — remove manual refetch at
  ~1036–1041 (`getApi`) and ~1106–1109 (`getTestCases`).
- `src/components/TestCaseForm/TestCaseForm.jsx` — remove similar manual refetch.

## Pattern (reuse for each mutation)
```js
async onQueryStarted({ fileId }, { dispatch, queryFulfilled }) {
  try {
    const { data: saved } = await queryFulfilled;
    dispatch(apiSlice.util.updateQueryData('getApi', { fileId }, (draft) => {
      Object.assign(draft, saved);            // or push/splice for list items
    }));
  } catch { /* invalidation tag still covers fallback */ }
}
```

## Steps
1. For each write mutation add `onQueryStarted` that patches the relevant cached query
   from the returned entity (item for update; push/splice for create/delete).
2. Delete the manual `await getApi/getTestCases` calls after mutations in the components.
3. Keep the id-granular invalidate tag as a safety net (covers error/edge cases).

## Acceptance
- After save, Network tab shows the mutation request ONLY — no follow-up GET.
- Saved value appears correctly without a refetch.

## Review notes
- Premise mismatch found + flagged to user; chose Option A (redirect to the real Zustand
  layer). RTK `apiSlice.js` left untouched — its mutations are uncalled; touching them
  achieves nothing until Sprint 5 migrates components onto RTK.
- `store/api.jsx`:
  - Added module-level `normalizeApi(api)` helper; `_fetchApi` now reuses it (DRY, no
    behavior change).
  - `saveApi`: now POPULATES `apiCache[fileId]` with the normalized saved entity instead
    of deleting it; stopped invalidating `testCaseCache` (saveApi does not change cases).
    activeApi + apis list now hold the normalized entity. → later getApi cache-hits, no GET.
  - `saveTestCase`: now syncs `testCaseCache[fileId]` with the updated list, so a later
    getTestCases cache-hit serves the fresh list (was stale before).
- `RequestPanel.jsx`: removed 3 redundant post-save refetches —
  handleUpdateApiConfiguration `getApi` (was new-API branch), handleRecordTestCase
  `getTestCases`, handleSaveApiFromModal `getApi`. Kept success/failure alert + dropdown
  close. `getApi`/`getTestCases` still used on mount/file-switch — not removed.
- createTestCase/bulkCreateTestCases NOT changed (out of named scope; their callers still
  refetch via onSave→getTestCases, which now cache-hits fresh). Env-var writes: skipped —
  they live in a separate store, not in the two named components; no refetch to remove there.
- Lint: only PRE-EXISTING errors remain in both files (unused vars in RequestPanel; two
  react-refresh non-component-export errors in api.jsx). No new lint errors. No unused vars
  introduced (removed the dead `const result` in handleSaveApiFromModal).
- Acceptance vs real layer: after save, activeApi/testCases update from the mutation
  response and cache stays consistent → no follow-up GET. Manual Network-tab smoke deferred
  to MASTER final smoke. DONE → self-reviewed → REVIEWED.
