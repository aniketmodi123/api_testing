# Workspace — Session Handover

Scope: WorkspaceSelector UI redesign (Postman-style dropdown) + full CRUD wiring. Nothing else.

---

## Goal

Make `WorkspaceSelector` dropdown match Postman's workspace switcher exactly, and expose full CRUD (the Update/rename op had no UI before).

Target reference: Postman dropdown = 👥 people-icon trigger + bold name + chevron; panel with `Search workspaces...` input + `Create` button row; list rows with people-icon, active row bold; `View all workspaces` footer with grid icon.

---

## What was done

### UI (matches Postman screenshot)
- Trigger button: borderless, 👥 people-icon + bold workspace name + chevron, hover = surface highlight.
- Dropdown: 360px wide, 12px radius. Search input (blue focus ring) + `Create` button side-by-side at top.
- List rows: 40px tall, people-icon + name. Active workspace = bold. Hover reveals edit (✎) + delete (×) action buttons.
- Footer: `View all workspaces` with grid icon, top divider. (Currently just closes dropdown — no dedicated all-workspaces page yet.)
- Search box filters list client-side (case-insensitive on name).

### CRUD — all linked end-to-end (frontend store → service → backend)

| Op | Store fn | Service | Backend route | Status |
|---|---|---|---|---|
| Create | `createWorkspace` | `POST /workspace/create` | `create_workspace.py:21` | existed |
| Read (list) | fetch in provider | `GET /workspace/list` | `list_workspace.py:20` | existed |
| Read (tree) | `getWorkspaceTree` | `GET /workspace/{id}` | `list_workspace_tree.py:19` | existed |
| **Update** | `updateWorkspace` | `PUT /workspace/{id}` | `update_workspace.py:22` | **UI newly added** |
| Delete | `deleteWorkspace` | `DELETE /workspace/{id}` | `delete_workspace.py:20` | existed |

Backend + service + store already had full CRUD. Only gap = Update had no UI. Added rename form (name + description).

Update body shape (`WorkspaceUpdateRequest`): `{ name?: str, description?: str }`. Both optional; backend only updates fields that are non-null. Owner-only (workspace.user_id == caller); returns 206 if not found / not owned.

Edit + delete buttons only render for non-shared (owned) workspaces — matches backend owner-only auth.

---

## Files touched

- `frontend/src/components/WorkspaceSelector/WorkspaceSelector.jsx`
  - Added inline SVG icon components: `WorkspaceIcon` (people), `ChevronIcon`, `GridIcon`, `EditIcon`.
  - Added state: `searchQuery`, `workspaceToEdit`, `editName`, `editDescription`.
  - Added handlers: `handleEditClick`, `handleUpdateWorkspace`, `handleCancelEdit`.
  - Pulled `updateWorkspace` from `useWorkspace()`.
  - Rebuilt dropdown JSX: search+create header, edit form (gated on `workspaceToEdit`), list with hover actions, footer.
- `frontend/src/components/WorkspaceSelector/WorkspaceSelector.module.css`
  - Rewrote trigger (borderless), dropdown (360px), `.searchInput` (blue focus ring), `.createTopButton`, `.workspaceItem` (40px, icon, bold active), `.itemActions`/`.itemActionBtn` (hover-reveal), `.dropdownFooter`/`.viewAllButton`.

Untouched: members panel, delete-confirm modal + loading gif, shared-role badges, `store/workspace.jsx`, `services/workspaceService.js`, all backend.

---

## Verified

- `npx vite build` passes (298 modules, no errors).

---

## Open / next (workspace only)

- `View all workspaces` footer has no destination page — currently just closes dropdown. Build a full workspaces grid/management page if wanted.
- No optimistic UI on update — relies on `refreshTrigger` refetch after PUT. Fine, but a brief flash possible.
- Members invite/role/remove endpoints exist (`members.py`) but not surfaced in this redesign — separate task.
