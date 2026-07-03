# Phase E — Custom Theme Editor + Shared Helpers  ⬜ TODO

**Goal:** A "Custom" tab in ThemePanel: pick a base theme, edit color tokens with live WCAG
contrast badges, auto-derive accent variants, name + Save + Export JSON. Extract the reusable
contrast/derive/export logic into one module so Theme Builder (F) and Marketplace (G) share it.

**Prereqs:** D (Custom tab slot exists). **Owns:**
`frontend/src/themes/customTheme.js`,
`frontend/src/components/ThemePanel/CustomThemeEditor.jsx` + `.module.css`,
and the `custom`-tab wiring inside `ThemePanel.jsx`.

---

## Task 1 — `frontend/src/themes/customTheme.js` (shared, pure)

```js
// WCAG relative luminance + contrast ratio (no library).
export function relativeLuminance(hex){ /* parse #rrggbb → sRGB→linear→0.2126R+0.7152G+0.0722B */ }
export function contrastRatio(hex1, hex2){ /* ((Llight+0.05)/(Ldark+0.05)).toFixed(1) */ }
export const isHex = (v)=>/^#[0-9a-fA-F]{6}$/.test(v);

// rgba(...,0.1) dim from a hex
export function hexToDim(hex, alpha=0.1){ /* → 'rgba(r,g,b,alpha)' */ }

// Given an --accent value, return the derived token overrides that should follow it.
export function deriveAccent(hex){
  return {
    '--btn-primary-bg': hex, '--border-focus': hex,
    '--input-focus-border': hex, '--sidebar-icon-active': hex,
    '--accent-dim': hexToDim(hex, 0.12),
  };
}

// localStorage custom-theme list (fallback store; backend is Phase H)
export function loadCustomThemes(){ /* JSON.parse(localStorage['polaris-custom-themes']||'[]') */ }
export function saveCustomThemes(list){ /* setItem */ }

// Download a token_map as a .json file
export function exportThemeJson(name, tokenMap){ /* Blob + a.click(), filename polaris-theme-<slug>.json */ }
```
(Reference impl bodies in `sessions/session-6.md` Task 1; move them here verbatim.)

## Task 2 — `CustomThemeEditor.jsx`

Props: `{ preferences, onPreviewChange(tokenMap), onActivate(name, tokenMap) }`.

State: `baseTheme` (default `preferences.theme`), `overrides` (init `{...THEME_PRESETS[baseTheme]}`),
`themeName`. On `baseTheme` change → reset overrides to that preset. On `overrides` change →
`onPreviewChange(overrides)`.

Editable groups (`EDITABLE_TOKENS`):
- **Surfaces**: `--bg`(Page background), `--surface-1`(Panel), `--surface-2`(Card/Input), `--surface-3`(Hover fill), `--border`(Border)
- **Accent**: `--accent`(Primary accent — hint "auto-derives hover + dim")
- **Text**: `--text`(Body, contrastAgainst `--bg`), `--text-muted`(Muted, contrastAgainst `--bg`)
- **Status**: `--success --warning --error --info`

Each row: `<input type="color">` + label + (when `contrastAgainst` set and both hex) a badge
`{ratio}:1 ✓/✗` (pass ≥ 4.5, `--badge-success-*` vs `--badge-error-*`). On accent change, merge
`deriveAccent(value)` into overrides.

Footer: name `<input maxLength={40}>`, `Save theme` (→ `onActivate` + persist; Phase H swaps in
backend POST), `Export JSON` (→ `exportThemeJson`). All controls use component tokens.

## Task 3 — `.module.css`

Scrollable column; uppercase section labels; 24×24 color pickers with token-bordered swatch;
contrast badge `.pass`/`.fail` using badge tokens; buttons use `--btn-primary-*`/`--btn-secondary-*`.
(Markup/classes in `sessions/session-6.md` Task 2.)

## Task 4 — Wire into `ThemePanel.jsx`

```jsx
{activeTab==='custom' && (
  <CustomThemeEditor
    preferences={preferences}
    onPreviewChange={(map)=>{ const el=previewRef.current; if(el) for(const [k,v] of Object.entries(map)) el.style.setProperty(k,v); }}
    onActivate={(name, map)=>{ for(const [k,v] of Object.entries(map)) document.documentElement.style.setProperty(k,v); setPreference('customTheme', name); }}
  />
)}
```

## Task 5 — Restore active custom theme on load (interim, localStorage)

In `ThemeContext.jsx`, after `applyPreset(preferences)`, if `preferences.customTheme` matches a
`loadCustomThemes()` entry, re-apply its `token_map` onto `:root`. (Phase H replaces this with the
backend `GET /themes/active` source of truth; keep localStorage as the logged-out fallback.)

---

## Acceptance

- Custom tab shows base selector + grouped pickers; changing Page background updates preview bg live.
- Changing accent updates btn-primary/focus/dim together. Contrast badges flip ✓/✗ at 4.5:1.
- Save → reload restores the custom theme. Export downloads valid JSON. `npm run build` clean.
