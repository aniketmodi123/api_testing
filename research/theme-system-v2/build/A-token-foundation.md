# Phase A — Token Foundation + New Axis Presets + Engine Rewrite  ✅ DONE

**Status:** Implemented & build-verified. This file records exactly what was built so later
phases can rely on it without re-reading the code.

**Goal:** Restructure the token engine to merge 11 axes. No visual change to the default
(Mid Dark) look. Add presets for the 4 Forge-only axes that no `sessions/*.md` covered.

---

## Files created

`frontend/src/themes/tokens/` (key registries — `*_TOKEN_KEYS` + empty `STATIC_*`):
- `spacing.js` — `SPACING_TOKEN_KEYS` (`--space-1..6`)
- `radius.js` — `RADIUS_TOKEN_KEYS` (`--radius-sm/--radius/-md/-lg/-xl`)
- `shadow.js` — `SHADOW_TOKEN_KEYS` (`--shadow-sm/-md/-lg`)
- `motion.js` — `MOTION_TOKEN_KEYS` (`--duration-fast/-base/-slow`, `--easing-default/-spring`)

`frontend/src/themes/presets/` (value maps + `*_META` arrays for the UI):
- `spacing.js` — `SPACING_PRESETS` `{compact, default, comfortable}` + `SPACING_META`
- `radius.js` — `RADIUS_PRESETS` `{sharp, default, rounded}` + `RADIUS_META`
- `shadow.js` — `SHADOW_PRESETS` `{flat, default, elevated}` + `SHADOW_META`
- `motion.js` — `MOTION_PRESETS` `{none, subtle, full}` + `MOTION_META`
- `accents.js` — `ACCENT_PRESETS` `{default,blue,indigo,cyan,green,orange,red,teal}` + `ACCENT_META`.
  `default.value === null` → engine skips applying (keeps the theme's own accent). Each other
  preset sets `--accent/-hover/-text/-dim`; because Tier-3 tokens reference `var(--accent)` in
  `themes.js`, overriding accent **cascades** to buttons/focus/sidebar automatically.
- `codeFonts.js` — `CODE_FONT_PRESETS` `{jetbrains,geistmono,firacode,ibmplex}` (sets `--font-mono`) + `CODE_FONT_META`
- `editorThemes.js` — `EDITOR_PRESETS` `{tokyonight,github,onedark,catppuccin,monokai}` (sets
  `--viz-json-*` + `--code-bg/-bg-deeper/-border/-gutter-bg/-active-line/-selection`) + `EDITOR_META`
- `a11y.js` — `A11Y_PRESETS` `{standard,highcontrast,largetext}` + `A11Y_META`.
  `highcontrast` remaps `--border→var(--border-strong)`, promotes subtle/muted text, sets
  `--focus-ring`. `largetext` bumps `--text-*` ~1.15×.

## Files rewritten

- `frontend/src/themes/tokens/colors.js` — `COLOR_TOKEN_KEYS` now documents Tier-2 **and** Tier-3
  component keys (`--btn-*`, `--input-*`, `--sidebar-*`, `--panel-*`, `--code-*`, `--viz-method-*`,
  `--viz-json-*`, `--badge-special-*`, `--border-strong`). **`STATIC_COLOR_TOKENS = {}`** — the old
  static `--method-*`/`--json-*` were removed (now themed per Phase B).
- `frontend/src/themes/index.js` — added `resolveTokens(prefs, customOverrides)` doing the full
  merge in the documented order; `applyPreset`/`applyPresetToElement` both accept an optional
  `customOverrides` map (wins last). Sets `data-{theme,font,spacing,radius,shadow,motion,editor,a11y}`
  on `:root`. Barrel re-exports every `*_META`. `DEFAULT_PREFERENCES` extended to the 11-axis shape
  + `customTheme: null`.
- `frontend/src/styles/global.css` `:root` — radius fallback values changed to the `default` preset;
  added motion fallbacks + `--border-strong` + `--focus-ring`. (Spacing fallback already matched
  `default`; shadow already `none` = `flat`.)

## Not changed (intentionally)

- `ThemeContext.jsx` — already spreads `preferences`, so all 11 axes are readable; legacy
  `theme`/`setTheme`/`isDarkMode` shims kept. Backend fetch + custom-theme apply is **Phase H**.
- The `:root` `--method-*`/`--json-*` and `--p0-*` alias blocks still exist in `global.css` for
  back-compat; Phase B repoints method/json aliases to `--viz-*`, Phase C deletes `--p0-*`.

## Acceptance (met)

- `npm run build` passes (0 errors).
- App still renders Mid Dark identically.
- `localStorage['polaris-preferences']` gains the new axis keys after first load.
- `resolveTokens(DEFAULT_PREFERENCES)` yields a flat map covering every registry token.
