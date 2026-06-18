# How to Execute the UI Redesign

## Roles
- **Architect (Claude main thread):** Wrote this plan. Verifies each phase. Makes decisions.
- **Implementer (subagent per phase):** Reads phase prompt, edits files, reports what changed.
- **You:** Run one phase at a time. Paste the phase prompt to a fresh agent. Send result back to architect to verify before moving to next phase.

---

## Execution Flow

```
Phase 1 → verify → Phase 2 → verify → Phase 3 → ... → Phase 10
```

Never run two phases in parallel. Each phase builds on the previous.

---

## How to run a phase

1. Open a new Claude chat (or spawn subagent).
2. Copy the full contents of `research/ui-redesign/phase-N-prompt.md`.
3. Paste as the task to the agent.
4. Agent reads the files listed, edits CSS (and sometimes minimal JSX), reports done.
5. Return to main Claude thread and say: "Phase N done, verify it."
6. Main Claude checks: no hardcoded hex, all class names preserved, no logic changed.
7. Move to Phase N+1.

---

## Phase Order (strict)

| Phase | File(s) | What changes |
|---|---|---|
| 1 | `global.css` | Design token system (violet accent, dark bg) |
| 2 | `Home.module.css`, Layout files | Main layout shell |
| 3 | `IconSidebar.module.css` | Icon sidebar |
| 4 | `HeaderComponents.module.css` | Top header bar |
| 5 | `Button.module.css`, `TabBar.module.css`, `MethodBadge.module.css`, `ConfirmModal.module.css` | Primitive components |
| 6 | `RequestPanel.module.css`, `buttonStyles.css`, `dropdown.css` | Main request panel |
| 7 | `CollectionTree.module.css`, `Sidebar.module.css`, `HistoryPanel.module.css` | Collection tree |
| 8 | All `BulkTestPanel/*.module.css`, `AssertionBuilder.module.css`, `TestCaseForm.module.css`, `TestResultCard.module.css`, `TestResultsGrid.module.css` | Bulk test + schedules + assertions |
| 9 | All `EnvironmentManager/*.module.css`, `VariableScopePanel.module.css`, `CollectionVarEditor.module.css`, `EnvironmentSwitcher.module.css` | Environments + variables |
| 10 | `AuthForm.module.css`, `WebSocketPanel.module.css`, `VariableAwareInput.module.css`, `ImportCurlModal.module.css`, misc | Auth pages + misc |
| **11** | `IconSidebar.jsx` + CSS | Sidebar → 220px wide, icon+label, workspace strip at bottom |
| **12** | `CollectionTree.jsx` NodeItem JSX + CSS | Collection rows → Postman-style: method badge, hover actions |
| **13** | `EnvironmentSelector.jsx` JSX + CSS, `VariableList.module.css` | Env list → compact rows; variable table restyle |
| **14** | `RequestPanel.module.css`, `buttonStyles.css`, `dropdown.css` | URL bar, request/response tabs, status badges |
| **15** | `WorkspaceSelector.module.css`, `EnvironmentSwitcher.module.css`, `Header.jsx` | Header slim-down, pill selectors |

**⚠️ Phases 11–15 change JSX structure — agent MUST read all listed files fully before editing.**

---

## Verify command (say this to main Claude after each phase)

> "Phase [N] done — verify it"

Main Claude will check the changed files against the verification criteria in each phase prompt.

---

## Design decisions (already locked — don't re-ask)

- Accent: `#8b5cf6` (violet)
- Background: `#09090b` (near-black)
- Font: Inter + Roboto Mono
- Radius: 6px
- Sidebar: 48px wide, icons only
- Header: 44px tall
- Style: Dark modern (Vercel/Raycast feel)

---

## What NOT to do

- Do not delete any component file.
- Do not change any event handler, store call, or API call.
- Do not add new features in these phases — only visual changes.
- Do not skip verification between phases.
- Do not mix phases.
