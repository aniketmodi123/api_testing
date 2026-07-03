# Phase C — CSS Token-Law Audit  ⬜ TODO

**Goal:** Make every component obey the token law: transitions → motion vars, radius/shadow →
tokens, button/input/sidebar/code → component tokens, kill the 24 hardcoded hex spots, delete
dead aliases. After this phase, switching any dimension axis visibly changes the live app.

**Prereqs:** Phases A + B (tokens exist). **Owns:** `global.css` + many `components/**/*.module.css`
+ a few `.jsx` inline styles. **Do NOT** touch theme/preset JS.

**Build after each task group:** `cd frontend && npm run build`.

---

## Task 1 — Repoint back-compat aliases in `global.css` (if not already)

In the `:root` fallback block, ensure method/json aliases point at the themed tokens and add
Tier-3 component fallbacks (so pre-JS FOUC stays on-theme):
```css
--method-get: var(--viz-method-get); --method-post: var(--viz-method-post);
--method-put: var(--viz-method-put); --method-patch: var(--viz-method-patch);
--method-delete: var(--viz-method-delete); --method-head: var(--viz-method-head);
--method-options: var(--viz-method-options);
--json-key: var(--viz-json-key); --json-string: var(--viz-json-string);
--json-number: var(--viz-json-number); --json-boolean: var(--viz-json-boolean);
--json-null: var(--viz-json-null);
--btn-primary-bg: var(--accent); --btn-primary-text:#fff; --btn-primary-hover: var(--accent-hover);
--btn-secondary-bg: var(--surface-2); --btn-secondary-border: var(--border);
--btn-danger-bg: var(--error); --btn-danger-hover: var(--error); --btn-ghost-hover: var(--surface-3);
--input-bg: var(--surface-2); --input-border: var(--border); --input-focus-border: var(--accent);
--input-text: var(--text); --input-placeholder: var(--text-muted);
--sidebar-bg: var(--surface-1); --sidebar-border: var(--border);
--sidebar-icon: var(--text-subtle); --sidebar-icon-active: var(--accent); --sidebar-active-bg: var(--accent-dim);
--panel-bg: var(--bg); --panel-border: var(--border); --panel-header-bg: var(--surface-1);
--code-bg: var(--surface-1); --code-bg-deeper: var(--bg); --code-border: var(--border);
--code-gutter-bg: var(--bg); --code-active-line: rgba(116,143,252,.06); --code-selection: rgba(116,143,252,.15);
--badge-special-bg: var(--badge-purple-bg, #062028);
--badge-special-text: var(--badge-purple-text, #67e8f9);
--badge-special-border: var(--badge-purple-border, #0e4d60);
```

## Task 2 — Transitions → motion vars

Find: `grep -rn "transition:" frontend/src/components frontend/src/styles --include="*.css" | grep -v "var(--duration"`
Replace each duration with motion vars, e.g.:
```css
transition: background var(--duration-fast) var(--easing-default),
            color var(--duration-fast) var(--easing-default);
```
Map: `0.1s`→`var(--duration-fast)`, `0.2s`/`0.15s`→`var(--duration-base)`, `0.25s+`→`var(--duration-slow)`.
Add once to `global.css`:
```css
@media (prefers-reduced-motion: reduce){ *{ transition-duration:0ms!important; animation-duration:0ms!important; } }
```
Do **not** edit transitions already inside reduced-motion blocks.

## Task 3 — Radius / shadow → tokens

Find radius: `grep -rn "border-radius:" frontend/src/components --include="*.css" | grep -v "var(--radius"`
Map `4px→--radius-sm`, `6px→--radius`, `8px→--radius-md`, `10px→--radius-md`, `12px→--radius-lg`,
`16px→--radius-xl`. **Keep** `50%`, `9999px`, and intentionally tiny `2px`.
Shadow: set `.card box-shadow: var(--shadow-md)` (was `none`); add `var(--shadow-sm)` to raised
list items/panels where appropriate. **Keep** the ThemePanel/modal drop shadow hardcoded — add a
`/* intentional chrome shadow — not themed */` comment.

## Task 4 — Component tokens in `global.css`

```css
.btn-primary{ background:var(--btn-primary-bg); color:var(--btn-primary-text); }
.btn-primary:hover{ background:var(--btn-primary-hover); }
.btn-secondary{ background:var(--btn-secondary-bg); color:var(--text); border:1px solid var(--btn-secondary-border); }
.btn-secondary:hover{ background:var(--btn-ghost-hover); }
.btn-danger{ background:var(--btn-danger-bg); color:#fff; }
.btn-danger:hover{ background:var(--btn-danger-hover); }
.input{ background:var(--input-bg); border:1px solid var(--input-border); color:var(--input-text); }
.input::placeholder{ color:var(--input-placeholder); }
.input:focus{ border-color:var(--input-focus-border); box-shadow:0 0 0 2px var(--accent-dim);
  transition:border-color var(--duration-fast) var(--easing-default), box-shadow var(--duration-fast) var(--easing-default); }
```
Remove the hardcoded `.btn-danger` reds (`#dc2626/#b91c1c`).

## Task 5 — Component tokens in modules

- `IconSidebar/IconSidebar.module.css`: `.topBar` bg→`--sidebar-bg`, border→`--sidebar-border`;
  `.navBtn` color→`--sidebar-icon`; `.navBtn.active` color→`--sidebar-icon-active`, bg→`--sidebar-active-bg`.
- `RequestPanel/RequestPanel.module.css`: `.methodSelector` → `--input-bg`/`--input-border`/`--input-text`, focus→`--input-focus-border`.
- CodeMirror overrides (`global.css`): `.cm-editor`→`--code-bg`, `.cm-gutters`→`--code-gutter-bg`,
  `.cm-activeLine`→`--code-active-line`, `.cm-selectionBackground`→`--code-selection`.
- `JsonEditor/JsonEditor.module.css`: `.textarea` bg→`--code-bg`, border→`--code-border`, focus bg→`--code-bg-deeper`.

## Task 6 — Rename `--badge-purple-*` → `--badge-special-*`

`grep -rn "badge-purple" frontend/src --include="*.css" --include="*.jsx" --include="*.js"` →
replace each `var(--badge-purple-X)` with `var(--badge-special-X)`.

## Task 7 — Kill the 24 hardcoded hex (token-law violators)

For each file map literals → tokens:
- `BulkTestPanel/BulkCollectionTree.jsx` — method colors GET/POST/PUT/DELETE/PATCH/OPTIONS/HEAD →
  `var(--viz-method-get|post|put|delete|patch|options|head)`.
- `RoleBadge.jsx` — manual badge hex (`#b45309/#b91c1c` + rgba fallbacks) → `--badge-*` tokens.
- `RequestPanel.jsx` — inline table styles (`#ccc/#f3f3f3/#09ee09ff/#fbeaea`) → `--border`/`--surface-2`/
  `--success`/`--error-bg-subtle`.
- `MoveCopyPanel/MoveCopyPanel.jsx` `#888` → `var(--text-muted)`.
- `WorkspaceSelector.jsx` `#fff` → `var(--accent-text)` or `var(--text)` per context.
- `LookingLoader.jsx` `#fff` default → `var(--text)`.
- `LatencySparkline.jsx` `#6366f1` fallback → keep `var(--accent, …)` but swap fallback to a token-safe value.
- `HeaderComponents.module.css` `var(--error,#e05252)` fallback — acceptable (fallback only); optional cleanup.

## Task 8 — Delete dead aliases in `global.css`

After Tasks 1–7, replace remaining references then delete the alias block:
- `var(--p0-*)`→ semantic equivalent (`--p0-primary→--accent`, `--p0-bg→--bg`, `--p0-surface→--surface-1`, …)
- `var(--background)→--bg`, `--background-lighter→--surface-2`, `--primary→--btn-primary-bg`(buttons)/`--accent`,
  `--primary-dark→--btn-primary-hover`, `--hover-background→--surface-3`, `--input-background→--input-bg`,
  `--text-color→--text`, `--muted→--text-muted`, `--border-color→--border`.
Find refs: `grep -rn "var(--p0-\|var(--background\b\|var(--primary)\|var(--hover-background\|var(--text-color\|var(--muted\b" frontend/src`.
Then remove the `/* Backward compat aliases */` block. Target `:root` ≤ ~90 lines.

---

## Acceptance

- `grep -rn "transition:" frontend/src/components --include="*.css" | grep -v "var(--duration"` → only commented exceptions.
- `grep -rn "var(--p0-\|badge-purple" frontend/src` → 0.
- `grep -rEn "#[0-9a-fA-F]{6}" frontend/src/components --include="*.jsx" --include="*.module.css"` → only documented exceptions (decorative dots).
- Setting `motion:none` → all transitions instant; `radius:rounded` → buttons/inputs round;
  `shadow:elevated` → cards gain depth; `spacing:comfortable` → visible breathing room; `a11y:largetext` → bigger type.
- `npm run build` clean.
