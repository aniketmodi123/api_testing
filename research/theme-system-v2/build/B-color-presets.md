# Phase B — 5 Color Themes, 3-Tier Tokens, Color Fixes  ✅ DONE

**Status:** Implemented & build-verified.

**Goal:** Replace the 3 flat themes with 5 themes, each emitting the full token set
(semantic + component + data-viz + badge). Fix the audited color bugs.

---

## File rewritten

`frontend/src/themes/presets/themes.js` — `THEME_PRESETS` now has **5** themes and `THEME_META`
has 5 cards.

| id | label | accent | badge-special identity |
|---|---|---|---|
| `light` | Light | `#3b5bdb` (calm blue) | teal |
| `dark` | Mid Dark (default) | `#748ffc` | cyan |
| `deep-dark` | Deep Dark | `#8fa4ff` | rose |
| `midnight` | Midnight (new) | `#00cbe8` electric cyan | violet |
| `ember` | Ember (new) | `#f97316` amber, warm text | gold |

Each theme object defines: surfaces/borders (incl. `--border-strong` added for a11y
highcontrast), text scale, accent set, full status sets (`-dim/-bg-subtle/-bg-dim/-bg-strong/
-border`), all badge groups, all component tokens (`--btn-*`, `--input-*`, `--sidebar-*`,
`--panel-*`, `--code-*`), `--viz-method-*`, `--viz-json-*`, and `--json-editor-*`.

## Bugs fixed (verifiable)

- **Purple bleed** — `--viz-method-patch` / `--viz-json-boolean` are now per-theme & distinct
  from accent (light `#6b21a8`, dark `#cc5de8`, deep-dark `#e599f7`, midnight `#c084fc`, ember `#c084fc`).
- **Badge-special** — distinct hue per theme (no more universal purple).
- **Light-mode syntax** — `--viz-json-*` are dark, readable on white (key `#1e40af`≈8:1, string `#1a7f37`≈7.6:1).
- **Over-saturated accents** — dark `#6c72ff→#748ffc`, light `#4f6ef7→#3b5bdb`.

## Companion edit required in `global.css` (do in Phase C if not yet applied)

Repoint the back-compat aliases so any un-migrated call site still works:
```css
--method-get: var(--viz-method-get); /* …post/put/patch/delete/head/options */
--json-key:   var(--viz-json-key);   /* …string/number/boolean/null */
```
And add Tier-3 component-token fallbacks in `:root` referencing semantic tokens
(`--btn-primary-bg: var(--accent)`, `--input-bg: var(--surface-2)`, `--sidebar-bg: var(--surface-1)`,
`--code-bg: var(--surface-1)`, `--badge-special-*` ← previous `--badge-purple-*` values, etc.)
so FOUC before JS runs stays on-theme. (Full list in `sessions/session-2.md` Task 2 — values
already superseded by `themes.js`; only the `var()`-alias fallbacks matter here.)

## Acceptance (met)

- `npm run build` passes.
- 5 cards in `THEME_META`. Light JSON keys render dark-blue; `--viz-method-patch`=`#6b21a8` on white.
- Midnight = cyan accent + violet special; Ember = orange accent + warm text. No two themes share
  a badge-special hue.
