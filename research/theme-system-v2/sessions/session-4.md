# Session 4 — Component Token Layer + CSS Audit

**Goal:** Wire component tokens (Tier 3) into the actual CSS. Replace `var(--accent)` with `var(--btn-primary-bg)` in buttons, `var(--surface-2)` with `var(--input-bg)` in inputs, etc. Clean up the 30+ backward-compat aliases in global.css. After this session, user can override e.g. sidebar color independently from accent.

**Prerequisites:** Sessions 1 + 2 complete (component tokens defined in themes.js, aliases in global.css).

---

## Task 1: Audit and map all CSS token usage

Run the following to find every CSS var reference in the project:
```bash
grep -roh "var(--[a-z-]*)" frontend/src/components/ frontend/src/styles/ --include="*.css" | sort | uniq -c | sort -rn | head -60
```

This gives you the most-used vars. Cross-reference against the component token registry in MASTER_PLAN.md. Any component using `var(--accent)` directly for a button bg, or `var(--surface-2)` for an input bg, should be switched to the component token.

---

## Task 2: Update `global.css` button classes to use component tokens

```css
/* Primary */
.btn-primary {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
}
.btn-primary:hover {
  background: var(--btn-primary-hover);
}

/* Secondary */
.btn-secondary {
  background: var(--btn-secondary-bg);
  color: var(--text);
  border: 1px solid var(--btn-secondary-border);
}

/* Danger */
.btn-danger {
  background: var(--btn-danger-bg);
  color: #ffffff;
}
.btn-danger:hover {
  background: var(--btn-danger-hover);
}
```

---

## Task 3: Update input/select classes to use component tokens

In `global.css`:
```css
.input {
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  color: var(--input-text);
}
.input::placeholder {
  color: var(--input-placeholder);
}
.input:focus {
  border-color: var(--input-focus-border);
  box-shadow: 0 0 0 2px var(--accent-dim);
}
```

In `RequestPanel/RequestPanel.module.css` — update `.methodSelector`:
```css
.methodSelector {
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  color: var(--input-text);
}
.methodSelector:focus {
  border-color: var(--input-focus-border);
}
```

---

## Task 4: Update sidebar to use sidebar component tokens

In `IconSidebar/IconSidebar.module.css`:
```css
.topBar {
  background: var(--sidebar-bg);
  border-bottom: 1px solid var(--sidebar-border);
}
.navBtn {
  color: var(--sidebar-icon);
}
.navBtn.active {
  color: var(--sidebar-icon-active);
  background: var(--sidebar-active-bg);
}
```

In `CollectionTree/CollectionTree.module.css` — left panel background should use `var(--sidebar-bg)`.

---

## Task 5: Update code editor to use code component tokens

In `global.css` CodeMirror overrides:
```css
.cm-editor {
  background-color: var(--code-bg) !important;
}
.cm-gutters {
  background-color: var(--code-gutter-bg) !important;
}
.cm-activeLine, .cm-activeLineGutter {
  background-color: var(--code-active-line) !important;
}
.cm-selectionBackground {
  background: var(--code-selection) !important;
}
```

In `JsonEditor/JsonEditor.module.css`:
```css
.textarea {
  background-color: var(--code-bg);
  border: 1px solid var(--code-border);
}
.textarea:focus {
  background-color: var(--code-bg-deeper);
}
```

---

## Task 6: Replace all badge-purple references with badge-special

Search for any remaining `--badge-purple-*` references:
```bash
grep -rn "badge-purple" frontend/src/ --include="*.css" --include="*.jsx" --include="*.js"
```

For each hit, replace:
- `var(--badge-purple-bg)` → `var(--badge-special-bg)`
- `var(--badge-purple-text)` → `var(--badge-special-text)`
- `var(--badge-purple-border)` → `var(--badge-special-border)`

The theme presets in Session 2 already define `--badge-special-*` per theme with distinct colors. This rename makes it semantic ("special type") rather than color-describing ("purple").

---

## Task 7: Clean up backward-compat aliases in global.css

The `:root` block in `global.css` has these aliases that are dead weight. Check if any component still references them:

```bash
grep -rn "var(--p0-\|var(--background\b\|var(--background-lighter\|var(--primary-background\|var(--primary)\b\|var(--primary-dark\|var(--primary-text\|var(--hover-background\|var(--selected-item-background\|var(--disabled\|var(--header-bg\|var(--card-bg\|var(--input)\b\|var(--text-color\|var(--muted\b\|var(--text-warn\|var(--border-color" frontend/src/ --include="*.css" --include="*.jsx"
```

For each hit:
- `var(--p0-error)` → `var(--error)`
- `var(--p0-primary)` → `var(--accent)`
- `var(--p0-surface-3)` → `var(--surface-3)`
- `var(--background)` → `var(--bg)`
- `var(--background-lighter)` → `var(--surface-2)`
- `var(--primary)` → `var(--btn-primary-bg)` (in buttons) or `var(--accent)` (other uses)
- `var(--primary-dark)` → `var(--btn-primary-hover)`
- `var(--hover-background)` → `var(--surface-3)`
- `var(--input-background)` → `var(--input-bg)`
- `var(--text-color)` → `var(--text)`
- `var(--muted)` → `var(--text-muted)`

After replacing ALL references, delete the alias block from `:root` in global.css. Leave only:
- True fallback values (tokens that JS sets at runtime)
- The `--p0-*` block can be fully deleted if no references remain

---

## Acceptance Criteria

- [ ] `grep -rn "var(--p0-" frontend/src/` returns 0 results
- [ ] `grep -rn "var(--background-lighter\|var(--primary-background\|var(--primary-dark" frontend/src/` returns 0 results  
- [ ] `grep -rn "badge-purple" frontend/src/` returns 0 results
- [ ] Switching themes changes button color, input border, sidebar bg independently if overridden in theme preset
- [ ] CodeMirror editor bg changes correctly per theme (use light theme to verify — editor bg should be near-white)
- [ ] global.css `:root` block is ≤ 80 lines (down from ~130)
- [ ] Build passes clean
- [ ] Run `npm run build` — 0 type/lint errors
