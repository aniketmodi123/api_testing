# Session Kickoff Prompts — one per phase

Each block is self-contained. Paste exactly one block into a **new** session. Do not combine
phases in one session — context grows too large and quality drops.

**Order:** C → D → E → F → G → H. C is independent (start anytime). D needs A+B done (they are).
E needs D. F and G need E. H needs E.

---

## Phase C

```
Read research/theme-system-v2/build/00-BUILD-PLAN.md in full, then research/theme-system-v2/build/C-css-token-audit.md.

Build ONLY Phase C. Follow the token law. Touch only files that phase owns. Phases A + B are already done (recorded in build/A-token-foundation.md and B-color-presets.md) — do not redo them.

When done: run `cd frontend && npm run build` (must pass), run the acceptance greps in the C file, then tick Phase C in build/00-BUILD-PLAN.md status table.
```

---

## Phase D

```
Read research/theme-system-v2/build/00-BUILD-PLAN.md in full, then research/theme-system-v2/build/D-appearance-panel.md.

Build ONLY Phase D. Follow the token law. Touch only files that phase owns. Phases A, B (and C if already ticked) are done — do not redo them. If Phase C is NOT yet ticked in 00-BUILD-PLAN.md, stop and tell the user — D assumes component tokens are already wired.

When done: run `cd frontend && npm run build` (must pass), verify the acceptance checklist in the D file by running the app (`npm run dev`) and exercising all 11 tabs, then tick Phase D in build/00-BUILD-PLAN.md status table.
```

---

## Phase E

```
Read research/theme-system-v2/build/00-BUILD-PLAN.md in full, then research/theme-system-v2/build/E-custom-editor.md.

Build ONLY Phase E. Follow the token law. Touch only files that phase owns. Phase D must already be ticked in build/00-BUILD-PLAN.md (the Custom tab slot must exist) — if not, stop and tell the user.

When done: run `cd frontend && npm run build` (must pass), verify the acceptance checklist in the E file, then tick Phase E in build/00-BUILD-PLAN.md status table.
```

---

## Phase F

```
Read research/theme-system-v2/build/00-BUILD-PLAN.md in full, then research/theme-system-v2/build/F-theme-builder.md.

Build ONLY Phase F. Follow the token law. Touch only files that phase owns. Reuse the shared helpers from frontend/src/themes/customTheme.js (built in Phase E) — do not duplicate contrast/derive/export logic. Phase E must already be ticked in build/00-BUILD-PLAN.md — if not, stop and tell the user.

When done: run `cd frontend && npm run build` (must pass), verify the acceptance checklist in the F file, then tick Phase F in build/00-BUILD-PLAN.md status table.
```

---

## Phase G

```
Read research/theme-system-v2/build/00-BUILD-PLAN.md in full, then research/theme-system-v2/build/G-marketplace.md.

Build ONLY Phase G. Follow the token law. Touch only files that phase owns. Reuse the shared helpers from frontend/src/themes/customTheme.js (built in Phase E) — do not duplicate logic. Phase E must already be ticked in build/00-BUILD-PLAN.md — if not, stop and tell the user.

When done: run `cd frontend && npm run build` (must pass), verify the acceptance checklist in the G file, then tick Phase G in build/00-BUILD-PLAN.md status table.
```

---

## Phase H

```
Read research/theme-system-v2/build/00-BUILD-PLAN.md in full, then research/theme-system-v2/build/H-backend-persistence.md.

Build ONLY Phase H. The backend conventions in this file are CORRECTED for the real repo (backend/src/) — do NOT use anything from research/theme-system-v2/sessions/session-7.md, it targets the wrong backend and wrong patterns. Phase E must already be ticked in build/00-BUILD-PLAN.md — if not, stop and tell the user.

When done: run `cd frontend && npm run build` (must pass) and start the backend to confirm the user_themes table auto-creates with no errors. Verify the acceptance checklist in the H file (POST/PUT/DELETE/activate flows), then tick Phase H in build/00-BUILD-PLAN.md status table.
```
