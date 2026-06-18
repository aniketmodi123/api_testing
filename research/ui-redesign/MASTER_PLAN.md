# UI Redesign — Master Plan

STATUS: planning
LAST_UPDATED: 2026-06-17
ARCHITECT: Claude (main thread)
IMPLEMENTERS: subagents (one phase at a time)
VERIFIER: Claude (main thread checks each phase before next starts)

---

## Project Goal

Full visual redesign of the React frontend.
**Zero feature loss. Zero backend changes. Zero logic changes in JSX.**
Only CSS and JSX structure (layout wrappers, className attributes) may change.

Design language: Dark modern — violet accent (#8b5cf6), near-black bg, Inter font, 8px radius.
NOT a Hoppscotch clone. NOT a Postman clone. Own identity.

---

## Hard Rules for Every Implementer

1. Never change any event handler, state, store call, or API call in JSX.
2. Never delete a component or file.
3. Never change prop names or interfaces.
4. CSS-only changes = safe. JSX structure changes = only when layout requires a wrapper div.
5. All color values go through CSS variables defined in `global.css`. Zero hardcoded hex in `.module.css`.
6. Dark mode = default. Light mode via `[data-theme="light"]` overrides in `global.css`.
7. Every phase ships independently. Do not mix phases.

---

## Phase Overview

| Phase | Name | Files | Status |
|---|---|---|---|
| 1 | Design Token System | `global.css` | TODO |
| 2 | Layout Shell | `Layout.jsx`, `Home.jsx`, `Home.module.css`, `Body.jsx` | TODO |
| 3 | Icon Sidebar | `IconSidebar.jsx`, `IconSidebar.module.css` | TODO |
| 4 | Header | `Header.jsx`, `HeaderComponents.module.css`, `Logo.jsx` | TODO |
| 5 | Primitive Components | `Button`, `TabBar`, `MethodBadge`, `ConfirmModal` | TODO |
| 6 | Request Panel | `RequestPanel.jsx`, `RequestPanel.module.css`, URL bar, tabs | TODO |
| 7 | Response Panel | response section inside RequestPanel | TODO |
| 8 | Collection Tree | `CollectionTree.jsx`, `CollectionTree.module.css` | TODO |
| 9 | Bulk Test / Schedules | `BulkTestPanel` all files | TODO |
| 10 | Environment Manager | `EnvironmentManager` all files | TODO |
| 11 | Auth + Sign-in pages | `SignIn.jsx`, `SignUp.jsx`, `AuthForm.module.css` | TODO |
| **12** | **Sidebar rebuild** — 220px, icon+label, workspace strip | `IconSidebar.jsx` + CSS | TODO |
| **13** | **Collection tree rows** — method badge, hover actions, dense | `CollectionTree.jsx` NodeItem + CSS | TODO |
| **14** | **Environment list** — cards→rows; variable table restyle | `EnvironmentSelector.jsx` JSX + CSS, `VariableList.module.css` | TODO |
| **15** | **Request panel** — URL bar, tab labels, status badges | `RequestPanel.module.css`, `buttonStyles.css`, `dropdown.css` | TODO |
| **16** | **Header + WorkspaceSelector** — slim pills, logo, no inline styles | `WorkspaceSelector.module.css`, `EnvironmentSwitcher.module.css`, `Header.jsx` | TODO |

Each phase has its own prompt file: `research/ui-redesign/phase-N-prompt.md`

**Phases 1–11 = CSS only (safe, mechanical)**
**Phases 12–16 = structural JSX + CSS (read files fully before changing)**

---

## Design Decisions (locked)

| Decision | Value | Reason |
|---|---|---|
| Accent color | `#8b5cf6` (violet-500) | Premium feel, unique vs Postman blue |
| Accent hover | `#7c3aed` (violet-600) | |
| Accent dim | `rgba(139, 92, 246, 0.12)` | Selected states, highlights |
| Background | `#09090b` (zinc-950) | Near-black, not pure black |
| Surface 1 | `#111113` | Sidebar, panels |
| Surface 2 | `#18181b` | Cards, inputs |
| Surface 3 | `#27272a` | Hover states |
| Border | `#27272a` | Subtle separation |
| Text primary | `#fafafa` | Near-white |
| Text muted | `#a1a1aa` | Labels, placeholders |
| Text subtle | `#52525b` | Disabled, hints |
| Success | `#22c55e` | GET method, pass |
| Warning | `#f59e0b` | PUT method |
| Error | `#ef4444` | DELETE method, fail |
| Info | `#3b82f6` | POST method |
| Font UI | `Inter` (Google Fonts) | Already loaded |
| Font mono | `Roboto Mono` (Google Fonts) | Already loaded |
| Font size base | `12px` | Dense developer tool |
| Border radius | `6px` | Slightly rounded, not flat |
| Sidebar width | `220px` | Icon + label (phase 12 rebuilds this) |
| Header height | `44px` | |
| Tab bar height | `36px` | |

---

## Feature → Component Map (what exists, never delete these)

| Feature | Key Components | Status |
|---|---|---|
| Multi test cases per API | `TestCaseForm`, `TestRunner`, `TestResultCard`, `TestResultsGrid` | EXISTS |
| Deep assertions | `AssertionBuilder` | EXISTS |
| Schedules | `BulkScheduler`, `BulkTestPanel`, `BulkControls` | EXISTS |
| Collection Runner | `BulkTestPanel`, `BulkSelection`, `BulkResults` | EXISTS |
| Environments | `EnvironmentManager`, `EnvironmentDetail`, `EnvironmentForm` | EXISTS |
| Variables | `VariableScopePanel`, `CollectionVarEditor`, `VariableAwareInput` | EXISTS |
| Auth builder | `AuthBuilder` (inside RequestPanel) | EXISTS |
| WebSocket | `WebSocketPanel` | EXISTS |
| Import/Export | `ImportCurlModal`, `ImportFileModal` | EXISTS |
| History | `HistoryPanel` | EXISTS |
| Workspace | `WorkspaceSelector`, `Workspace/InviteModal`, `MembersPanel` | EXISTS |

---

## Verification Checklist (architect runs after each phase)

After each phase implementation:
1. No hardcoded hex colors in `.module.css` files touched (all use CSS vars).
2. No event handlers, store calls, or API calls changed in JSX.
3. No component files deleted.
4. No prop interfaces changed.
5. Feature still visually present and functional.

---

## File: Phase Prompt Index

| Phase | Prompt file |
|---|---|
| 1 | `research/ui-redesign/phase-1-prompt.md` |
| 2 | `research/ui-redesign/phase-2-prompt.md` |
| 3 | `research/ui-redesign/phase-3-prompt.md` |
| 4 | `research/ui-redesign/phase-4-prompt.md` |
| 5 | `research/ui-redesign/phase-5-prompt.md` |
| 6 | `research/ui-redesign/phase-6-prompt.md` |
| 7 | `research/ui-redesign/phase-7-prompt.md` |
| 8 | `research/ui-redesign/phase-8-prompt.md` |
| 9 | `research/ui-redesign/phase-9-prompt.md` |
| 10 | `research/ui-redesign/phase-10-prompt.md` |
| 11 | `research/ui-redesign/phase-11-prompt.md` |
