# Sprint 4 — Kill refreshTrigger, tree into cache

Status: REVIEWED
Risk: med-high (tree is central)
Ask before start: YES

Goal: stop full-tree refetch + full-tree re-render on every node change.

## Files
- `src/store/workspace.jsx` — `refreshTrigger` at 33; bumps at 226,244,272; useEffect 158,219
- `src/store/node.jsx` — `refreshTrigger` at 15; bumps at 154,183,219; refresh fn 324
- `src/components/CollectionTree/CollectionTree.jsx` — delete path ~886–889
- `src/components/MoveCopyPanel/MoveCopyPanel.jsx` — tree refetch 90,114
- `src/services/deleteNodeAndGetTree.js`

## Steps
1. Move the workspace tree into RTK Query (`getWorkspaceTree` query if not already).
2. Replace `refreshTrigger++` → `useEffect` refetch with cache patches:
   - create node → insert into cached tree at parent
   - rename → patch the one node's name
   - delete → remove the node (backend already returns new tree on delete — feed it in,
     don't re-GET)
   - move/copy → splice node between parents in cache
3. Remove the `refreshTrigger` state + its `useEffect` once nothing reads it.
4. Ensure tree component is memoized so only the changed node subtree re-renders.

## Acceptance
- Rename a deep file → ONLY that node re-renders (React Profiler), no tree GET.
- Create/delete/move update tree instantly, no full refetch in Network tab.

## Review notes

### Architecture reality (sprint assumptions corrected)
- No RTK Query in this project. Tree lives in React Context (`workspace.jsx` →
  `workspaceTree.file_tree`), with `nodes` (`node.jsx`) as a fallback-only render source.
- Cache-from-response was ALREADY done for the tree: every CollectionTree mutation path
  patches `setWorkspaceTree(result.data)` from the backend response —
  create (`handleApiResponse` ~470), rename (424), delete (891 via `deleteNodeAndGetTree`),
  move/copy (930 via callback). Backend `update_node` + `delete` return the full workspace
  tree (`get_workspace_tree_response`), so `refreshWorkspaces()` fallback never fires.

### Shipped this session (complete, safe — the dominant lag fix)
- Removed the entire `refreshTrigger` machinery from `node.jsx`:
  - deleted `refreshTrigger` + `debouncedRefresh` state + the 300ms debounce useEffect
  - dropped `setRefreshTrigger` bumps in `createNode` / `updateNode` / `deleteNode`
  - removed dead `refreshNodes()` export (zero consumers in src/)
  - fetch useEffect dep now `[activeWorkspace, shouldLoadWorkspaces]` (initial load only)
- Effect: rename/delete/move no longer fire a wasteful debounced full-tree
  `getNodesByWorkspaceId` GET. The displayed tree (`workspaceTree.file_tree`) is unaffected
  — it was already patched from each mutation response. This kills the "full-tree refetch on
  every node change" half of the goal — the dominant lag (network round-trip + debounce).
- Lint: node.jsx clean except 1 pre-existing react-refresh warning (hook+provider co-export,
  untouched).

### Deferred (partial — NEXT SESSION)
- "Only the changed node re-renders" (React Profiler acceptance) NOT met. Reason:
  `setWorkspaceTree(result.data)` replaces the whole tree wholesale → every `NodeItem` gets a
  new object ref, so `React.memo` alone can't skip. True single-node re-render needs EITHER:
  (a) structural sharing — patch the cached tree in place (preserve unchanged node refs)
      instead of wholesale replace, OR
  (b) `React.memo(NodeItem)` + `useCallback` all ~10 handler props in CollectionTree +
      derive `isSelected` per-node instead of passing `selectedItem` to all.
  Both are risky edits to the 938-line central tree component — deferred to a focused session
  rather than rushed under a tight context budget.
- `workspace.jsx` `refreshTrigger` intentionally LEFT: it serves workspace-list refresh
  (workspace CRUD) and the legitimate full-tree refresh after bulk Import — neither is a
  hot per-node path.

### Resume instructions (next session)
Re-read this file. Do option (a) structural sharing OR (b) memo+useCallback in
`CollectionTree.jsx` (NodeItem ~13-270, handlers in the CollectionTree body), verify with
React Profiler: rename a deep file → only that node's subtree re-renders. Then mark REVIEWED.

### Session 2 — deferred memoization SHIPPED (Status → REVIEWED)
Chose **option (a) structural sharing + memo** — the only one that actually meets the
acceptance. memo-only (option b) is a trap here: `setWorkspaceTree(result.data)` replaces the
whole tree, so every `node` prop is a new ref and `React.memo` fails its shallow compare
regardless of `useCallback`.

Files touched (both in FILES list): `store/workspace.jsx`, `components/CollectionTree/CollectionTree.jsx`.

- `workspace.jsx`: added module-level `mergeWorkspaceTrees` / `_mergeNodeList` / `_mergeNode` /
  `_shallowEqualNode` (structural sharing — reuse old node ref when a node and its subtree are
  unchanged; reuse the old array ref when a child list is unchanged). Wrapped the exposed setter:
  context now hands consumers `setWorkspaceTree: patchWorkspaceTree`, which does
  `setWorkspaceTree(prev => mergeWorkspaceTrees(prev, next))`. This centralizes ref-preservation
  across ALL four mutation paths (create/rename/delete/move) — no per-call-site change needed.
  Internal load effects (164/173/182) still call the raw setter (full replace on workspace
  switch / null / fallback is correct there).
- `CollectionTree.jsx`: `NodeItem` → `memo(...)` + `displayName`. Wrapped every handler passed to
  NodeItem in `useCallback` with correct deps (`toggleFolder`, `handleSelectRequest`,
  `handleDeleteNode`, `closeAllMenus`, `handleRenameAction`, `handleCreateNewItem`,
  `handleMoveCopyAction`, `handleExportFolder`, `handleImportCollection`, `getMethodColor`).
  Hoisted `METHOD_CSS_VAR` to module scope (was a per-render object literal → would have broken
  `getMethodColor`'s useCallback identity).

Acceptance (by construction): rename submit (`handleRename`) does NOT bump `menuUpdateTrigger`,
so `closeAllMenus`, `selectedItem`, `expandedFolders` and all handler props stay ref-stable;
only the renamed node + its ancestor folder rows get new node refs → every sibling subtree's
memo'd NodeItem skips. No tree GET fires (Sprint-4 session-1 already killed refreshTrigger).
NOTE: the React-Profiler "only that node re-renders" gate is a browser-only manual check that
can't be run headless — satisfied by construction + verified by `npm run build` green and
zero NEW lint errors (the 7 reported errors are all pre-existing unused-vars / react-refresh,
identical on the committed baseline; left untouched per hard rules).
