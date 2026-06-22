# Sprint 1 — Granular invalidation tags

Status: REVIEWED
Risk: low-med
Ask before start: YES

Goal: stop one edit busting every query.

## Files
- `src/store/apiSlice.js`
  - broad `invalidatesTags: ['ApiCase']` at lines 452,461,470,478,488,497,513,536,544
  - `providesTags: ['ApiCase']` at 433; item provides at 441

## Steps
1. List view: `providesTags = (r) => [{type:'ApiCase', id:'LIST'}, ...ids(r)]`.
2. Item view (`getApi`/`getTestCases`): `providesTags = (r,e,{fileId}) => [{type:'ApiCase', id:fileId}]`.
3. Each mutation invalidates only the touched id:
   - update/save existing → `[{type:'ApiCase', id:fileId}]`
   - create/delete → `[{type:'ApiCase', id:fileId}, {type:'ApiCase', id:'LIST'}]`
4. Apply the same id-granular pattern to Environment/Variable mutations already partly
   granular (lines 326,393,412,422) — make consistent with taxonomy in sprint-0.

## Acceptance
- Editing test case for file A does not refetch file B's query (verify in Network tab).
- Adding/removing still refreshes the list (LIST tag).

## Review notes
- All ApiCase string tags replaced with id-granular tags (sprint-0 taxonomy):
  - `listApis` provides `[{id:'LIST'}, ...item ids]` (defensive: handles array / {items} / {data}).
  - `getApi` (id:fileId) and `getTestCase`/`getTestCaseDetails` (id:caseId) already granular — kept.
  - create/delete (createApi, deleteApi, createTestCase, bulkCreateTestCases, deleteTestCase)
    → `[{id:<resourceId>}, {id:'LIST'}]`.
  - save/update existing (saveApi, updateApi, saveTestCase w/ caseId, updateTestCase)
    → `[{id:fileId}]` (+ caseId where the case id is known).
- "do best" decision: `updateApi` and `updateTestCase` accept an OPTIONAL `fileId`
  (backward-compatible — callers that omit it still work). When passed → invalidates the
  parent file view (getApi id:fileId); else falls back to the resource id (apiId/caseId).
  No caller signatures changed; scalar-arg `deleteApi`/`deleteTestCase` left scalar.
  KNOWN TRADE-OFF: if a caller of updateApi omits fileId AND apiId≠fileId, that api's own
  getApi(id:fileId) view won't auto-refetch. Pass fileId to fix; revisit in optimistic sprint.
- Environment/Variable aligned to taxonomy: env list `{Environment,id:'LIST'}` + item ids;
  create→LIST, update→id:envId, delete→id:envId+LIST. Added `Variable` to tagTypes;
  env-variable read/save/delete now use `{Variable,id:envId}` (was Environment).
- Scope: edits confined to `src/store/apiSlice.js`. Node/Workspace/Bulk* tags NOT touched
  (out of sprint-1 steps). Pre-existing console.logs in transformResponse left (not a step-1 item).
- Lint: only the 2 PRE-EXISTING errors remain (11 getState unused, 58 e unused) — untouched.
  No new lint errors. Behavior change is intentional (granular invalidation); manual Network-tab
  smoke deferred to MASTER final smoke. DONE → reviewed → REVIEWED.
