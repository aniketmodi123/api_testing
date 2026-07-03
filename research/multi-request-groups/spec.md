# Spec — Multi-Request Groups

STATUS: updated
LAST_CHANGED: 2026-06-16

---

## Overview

"Multi-Request Groups" covers three distinct Postman features:

| Feature | Postman | APIPilot | Gap |
|---|---|---|---|
| Collections (group + run requests) | ✅ | ✅ (collections + bulk runner) | — |
| Sidebar bulk actions (multi-select) | ✅ | ❌ | P2 |
| Linked / reusable requests (sync across collections) | ✅ | ❌ | P2 |
| `pm.execution.runRequest()` (script-call another request) | ✅ | ❌ | P3 |

Current spec said "collections + bulk runner = done" — correct for group execution,
but sidebar bulk actions and linked requests are missing.

---

## Part A — Sidebar Bulk Actions

### What Postman Ships

Multi-select in sidebar:
- Ctrl/Cmd+click to select individual items
- Shift+click to select range
- Actions on selection: Copy, Paste, Delete, Move (drag)
- Undo for moves and duplicates (time-bound)
- Works on requests and folders

### Backend

No new endpoints needed. Bulk delete and bulk move map to existing single-item endpoints
called in sequence, or new batch endpoints for efficiency.

#### New Endpoints (optional, for efficiency)

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| DELETE | `/nodes/bulk` | editor | Delete multiple nodes (files/folders) by ID list |
| POST | `/nodes/bulk-move` | editor | Move multiple nodes to a new parent folder |

#### DELETE `/nodes/bulk`
```json
{ "node_ids": [1, 2, 3] }
```
Validate all node_ids belong to user's workspace before deleting. Atomic transaction.

#### POST `/nodes/bulk-move`
```json
{ "node_ids": [1, 2, 3], "target_folder_id": 42 }
```
Validate target_folder_id is a folder node in same workspace.

### Frontend

| Component | Location | Purpose |
|---|---|---|
| `MultiSelectOverlay` | `src/components/sidebar/MultiSelectOverlay.tsx` | Keyboard listener for Ctrl/Cmd+click, Shift+click; manages selected node ID set |
| `BulkActionToolbar` | `src/components/sidebar/BulkActionToolbar.tsx` | Floating toolbar when ≥1 node selected: count badge + Delete / Move / Clear |
| `BulkMoveModal` | `src/components/sidebar/BulkMoveModal.tsx` | Folder tree picker to move selected nodes into |

#### TypeScript Interface

```typescript
interface MultiSelectState {
  selectedIds: Set<number>;
  anchorId: number | null;         // Shift+click anchor
  active: boolean;
}

interface BulkActionToolbarProps {
  selectedCount: number;
  onDelete: () => void;
  onMove: () => void;
  onClear: () => void;
}
```

#### Behavior

**`MultiSelectOverlay`**: Wraps sidebar tree. Detects Ctrl/Cmd+click → toggle node in set.
Shift+click → select range from `anchorId` to clicked node (by DOM order in tree).
Escape → clear selection. When `selectedIds.size > 0` → mount `BulkActionToolbar`.

**`BulkActionToolbar`**: Fixed bar at bottom of sidebar. Shows "N selected" + three buttons.
Delete → confirm dialog "Delete N items?" → `DELETE /nodes/bulk` → refresh tree → clear selection.
Move → open `BulkMoveModal`.

**`BulkMoveModal`**: Folder-only tree picker (files not shown). Select destination → confirm →
`POST /nodes/bulk-move` → refresh tree → clear selection.

#### API Calls

| Action | Method | URL | When |
|---|---|---|---|
| Bulk delete | DELETE | `/nodes/bulk` | Delete confirm |
| Bulk move | POST | `/nodes/bulk-move` | Move confirm |

---

## Part B — Linked / Reusable Requests

### What Postman Ships

A **linked copy** is a request that stays in sync with its source. When the source request
changes (URL, headers, body), all linked copies update automatically. Useful for: a single
"auth check" request reused across multiple collections.

**Creation**: Cmd/Ctrl+drag into another collection = linked copy. Or right-click → Copy →
Paste Linked Copy at destination.

**Script-based**: `pm.execution.runRequest("collection/request-name")` calls another saved
request from a script (2025 addition).

### APIPilot Equivalent Design

APIPilot doesn't have a direct equivalent. Proposed implementation:

**`LinkedRequest`** — a node that references a source `Request` by ID. Reading it returns
the source request data. Writing to it writes to the source. Deleting it removes only the link,
not the source.

#### New DB Model: `RequestLink`

```
id              UUID PK
source_node_id  INTEGER FK → Node.id (the original request node)
link_node_id    INTEGER FK → Node.id (the placeholder node in target collection)
workspace_id    INTEGER FK → Workspace.id
created_at      TIMESTAMPTZ
```

`link_node_id` is a real `Node` row with `type = "link"` and `linked_to = source_node_id`.
When reading `link_node_id` contents → return `source_node_id` contents instead.

#### `Node` model addition

```
linked_to   INTEGER FK → Node.id nullable   -- non-null when type="link"
```

#### New Endpoints

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST | `/nodes/{node_id}/create-link` | editor | Create linked copy in target folder |
| GET | `/nodes/{node_id}/links` | viewer | List all linked copies of this node |
| DELETE | `/nodes/{link_node_id}/unlink` | editor | Remove link without deleting source |

#### POST `/nodes/{node_id}/create-link`

```json
{ "target_folder_id": 42 }
```

Creates a new Node row (`type="link"`, `linked_to=node_id`) inside `target_folder_id`.
Name defaults to source node name + " (linked)".

Response: new link node metadata.

### Frontend

| Component | Location | Purpose |
|---|---|---|
| `LinkBadge` | `src/components/sidebar/LinkBadge.tsx` | Small chain icon on linked nodes in sidebar |
| `CreateLinkMenuItem` | `src/components/sidebar/NodeContextMenu.tsx` | Context menu item: "Create Linked Copy" → folder picker |
| `LinkedFromPanel` | `src/components/request-builder/LinkedFromPanel.tsx` | In request editor: "This request is linked from X" notice + unlink button |
| `LinkTargetPicker` | `src/components/sidebar/LinkTargetPicker.tsx` | Folder tree modal to pick where to place linked copy |

#### Behavior

**`LinkBadge`**: Chain icon overlaid on node icon in sidebar tree. Tooltip: "Linked copy — editing updates the source." Source nodes show "N links" badge on hover.

**`CreateLinkMenuItem`**: Appears in right-click context menu on any file node. Click → opens `LinkTargetPicker` modal → confirm → `POST /nodes/{id}/create-link` → refresh tree.

**`LinkedFromPanel`**: Banner inside request editor when `node.type === "link"`. Shows: "Linked from [source name] in [source folder]". Unlink button → `DELETE /nodes/{id}/unlink` → node becomes independent copy.

---

## Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Bulk actions: new endpoint vs sequential calls | New bulk endpoints | Single transaction; avoids partial-delete on error |
| 2 | Linked request model | `Node.linked_to` FK + `type="link"` | Minimal schema change; resolves transparently at read time |
| 3 | Link sync strategy | Real-time (read-through) | Linked node always reads source; no copy to keep in sync |
| 4 | `pm.execution.runRequest()` | Deferred | Requires sandboxed script runner calling back into request engine; P3 |
| 5 | Bulk copy-paste | Deferred | Complex clipboard state; low priority vs delete/move |

---

## Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | Bulk delete includes linked source node | Warn: "X linked copies will also be affected" — show count; require confirm |
| 2 | Source node deleted, link nodes orphaned | Set `linked_to = null` on source delete; show "Source deleted" badge on orphan |
| 3 | Circular link (link to a link) | Block at BE: `source_node_id` must have `type != "link"` |
| 4 | Bulk move across workspaces | Validate all `node_ids` and `target_folder_id` in same workspace; reject cross-workspace |
| 5 | Shift+click range in collapsed folder | Only visible (expanded) nodes included in range; collapsed children skipped |
| 6 | Linked node in a different workspace | Block: links only within same workspace |

---

## Deferred

| Item | Reason |
|---|---|
| `pm.execution.runRequest()` script API | Requires script sandbox calling back into request engine; P3 |
| Bulk copy-paste | Clipboard state complexity; P3 |
| Undo for bulk operations | Needs operation log; deferred |
| Cross-workspace linked requests | Security complexity; deferred |
