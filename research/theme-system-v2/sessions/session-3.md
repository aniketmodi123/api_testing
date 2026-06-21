# Session 3 — Spacing / Radius / Shadow / Motion Wired Into UI

**Goal:** The preset files from Session 1 exist but the UI doesn't expose controls for them yet, and existing CSS still uses hardcoded transition values instead of motion tokens. This session: wire up all 4 new dimensions into the CSS, update global.css transitions to use motion vars, and validate that changing a preset actually changes the visual output.

**Prerequisites:** Session 1 complete (preset files exist, index.js merges them).

---

## Task 1: Replace hardcoded transitions in key CSS files

Search every `transition:` rule in the frontend and replace hardcoded durations with motion vars.

### Pattern to find and replace

**Before:**
```css
transition: background 0.1s, color 0.1s;
transition: opacity 0.2s ease;
transition: background-color 0.2s ease, height 0.1s ease-out;
```

**After (using motion vars):**
```css
transition: background var(--duration-fast) var(--easing-default),
            color var(--duration-fast) var(--easing-default);
transition: opacity var(--duration-base) var(--easing-default);
transition: background-color var(--duration-base) var(--easing-default),
            height var(--duration-fast) var(--easing-default);
```

### Files to update (scan all CSS modules for `transition:`):
Run this to find all occurrences:
```bash
grep -rn "transition:" frontend/src/components/ frontend/src/styles/ --include="*.css" | grep -v "var(--duration"
```

Priority files (known to have transitions):
- `ThemePanel/ThemePanel.module.css` — card hover, tab transitions
- `IconSidebar/IconSidebar.module.css` — nav button transitions
- `RequestPanel/RequestPanel.module.css` — method selector, inputs
- `TabBar/TabBar.module.css`
- `CollectionTree/CollectionTree.module.css`
- `global.css` — button transitions, tr hover

Do NOT replace transitions inside `@media (prefers-reduced-motion: reduce)` blocks — add those blocks if they don't exist.

### Add reduced motion support to global.css
```css
@media (prefers-reduced-motion: reduce) {
  * {
    transition-duration: 0ms !important;
    animation-duration: 0ms !important;
  }
}
```

---

## Task 2: Replace hardcoded border-radius in component CSS

The `--radius-*` vars already exist and are used well. But some components have hardcoded `border-radius: 4px` or `border-radius: 8px` instead of using vars. Scan and fix:

```bash
grep -rn "border-radius:" frontend/src/components/ --include="*.css" | grep -v "var(--radius"
```

Replace:
- `border-radius: 4px` → `border-radius: var(--radius-sm)`
- `border-radius: 6px` → `border-radius: var(--radius)`
- `border-radius: 8px` → `border-radius: var(--radius-md)`
- `border-radius: 10px` → `border-radius: var(--radius-md)`
- `border-radius: 12px` → `border-radius: var(--radius-lg)`
- `border-radius: 16px` → `border-radius: var(--radius-xl)`

Exception: `border-radius: 50%` (circles) and `border-radius: 2px` (too specific, keep hardcoded) and `border-radius: 9999px` (full pills — keep as-is).

---

## Task 3: Apply shadow vars to panels and cards

Current state: `--shadow-sm: none`, `--shadow-md: none`, `--shadow-lg: none` (default preset is 'flat').

Components that should USE shadow vars (even though default is `none`):
- ThemePanel — currently has `box-shadow: 0 8px 32px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.16)` hardcoded. **Leave this one hardcoded — panel shadow is intentional design, not a theme var.**
- Modal backdrops — leave as-is (overlay-bg handles this)
- `.card` in global.css — change `box-shadow: none` to `box-shadow: var(--shadow-md)`
- CollectionTree items, NodeDetailPanel — add `box-shadow: var(--shadow-sm)` where appropriate

When user switches to 'elevated' shadow preset, these surfaces will gain depth automatically.

---

## Task 4: Add spacing + motion to global.css button/input classes

Update the global `.btn` class:
```css
.btn {
  transition: background var(--duration-fast) var(--easing-default),
              opacity var(--duration-fast) var(--easing-default);
}
```

Update the global `.input:focus`:
```css
.input:focus {
  outline: none;
  border-color: var(--input-focus-border);
  box-shadow: 0 0 0 2px var(--accent-dim);
  transition: border-color var(--duration-fast) var(--easing-default),
              box-shadow var(--duration-fast) var(--easing-default);
}
```

---

## Task 5: Validate all presets work by testing in browser

Start dev server: `cd frontend && npm run dev`

Test checklist:
1. Open ThemePanel → currently only shows Colors and Font tabs (spacing/radius/shadow/motion tabs come in Session 5)
2. Open browser DevTools → Application → Local Storage → `polaris-preferences`
3. Manually set `spacing: "comfortable"` in localStorage, reload → verify spacing increases
4. Manually set `radius: "sharp"` → verify buttons/inputs get sharper corners
5. Manually set `shadow: "elevated"` → verify `.card` gets visible shadow
6. Manually set `motion: "none"` → verify all transitions are instant
7. Manually set `motion: "full"` → verify transitions feel fluid

---

## Acceptance Criteria

- [ ] `grep -n "transition:" frontend/src/components/ --include="*.css" -r | grep -v "var(--duration"` returns 0 results (or only intentional exceptions with a comment)
- [ ] `@media (prefers-reduced-motion: reduce)` block exists in global.css
- [ ] Setting `motion: "none"` makes ALL transitions instant
- [ ] Setting `radius: "rounded"` visibly rounds buttons and inputs
- [ ] Setting `shadow: "elevated"` adds depth to cards
- [ ] Setting `spacing: "comfortable"` adds visible breathing room
- [ ] Build passes clean
