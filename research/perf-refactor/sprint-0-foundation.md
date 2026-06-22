# Sprint 0 — Foundation (no behavior change)

Status: REVIEWED
Risk: low
Ask before start: no

Goal: clean the base so every later sprint is safe and consistent. No user-visible
behavior change.

## Decisions (locked for all later sprints)
- **Single source of truth = RTK Query** for ALL server state.
- Zustand keeps ONLY pure UI state (selected node, open panels, active tab).
- Backend envelope is always `{ response_code, data, error_message }`.

## Tag taxonomy (id-granular — used by every later sprint)
| Entity        | List tag                          | Item tag                       |
|---------------|-----------------------------------|--------------------------------|
| ApiCase       | `{type:'ApiCase', id:'LIST'}`     | `{type:'ApiCase', id:fileId}`  |
| Node/tree     | `{type:'Node', id:'LIST'}`        | `{type:'Node', id:nodeId}`     |
| Environment   | `{type:'Environment', id:'LIST'}` | `{type:'Environment', id:envId}`|
| Variable      | `{type:'Variable', id:envId}`     | (scoped by env)                |
Rule: read provides `[LIST, ...ids]`; mutate invalidates touched id (+ LIST on add/remove).

## Files
- `src/store/apiSlice.js` (response unwrap ~74–160, `console.log` at 78)
- `src/store/api.jsx` (any response `console.log`)
- new: `src/store/unwrapResponse.js` (extracted helper)

## Steps
1. Extract `baseQueryWithTransform` unwrap logic into `unwrapResponse.js` as one pure
   helper: input = raw `{response_code,data,error_message}`, output = unwrapped data or
   throws a typed error. Keep the special cases (206 no-variables → `{}`; `/variables`
   list → `data.variables`; `/environments` list shaping).
2. Re-import the helper in `apiSlice.js` so `baseQueryWithTransform` just calls it.
3. Remove `console.log('API Response', …)` (apiSlice.js:78) and any response logs in
   `api.jsx`. Gate genuinely-useful debug behind `import.meta.env.VITE_ENABLE_DEBUG_LOGS`.
4. Add a short JSDoc on the helper documenting the envelope contract.

## Acceptance
- App behaves identically (manual smoke: load tree, open an API, list envs).
- No response payloads logged in console at default settings.
- Unwrap logic lives in one file; `apiSlice.js` no longer inlines it.

## Review notes
- Extracted unwrap logic to `src/store/unwrapResponse.js` (`unwrapBackendResponse`),
  1:1 with old `baseQueryWithTransform` branches (206 no-vars, /variables, /environments).
- `apiSlice.js`: imports helper; `baseQueryWithTransform` slimmed to 3 lines; removed
  `console.log('API Response', …)`. 401 log + gated `prepareHeaders` debug log kept
  (error/gated, not response noise). No response logs existed in `api.jsx`.
- Lint: `unwrapResponse.js` clean. Two PRE-EXISTING errors remain in `apiSlice.js`
  (11 `getState` unused, 58 `e` unused) — out of scope, untouched.
- Tag taxonomy documented above; applied starting Sprint 1.
- Behavior identical (no logic change). DONE → reviewed → REVIEWED.
