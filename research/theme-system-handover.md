# Theme System — Session Handover

**Date:** 2026-06-20  
**Status:** Partially done. Build passes. Theme switching works for ~80% of the UI. Remaining: 9 CSS files with hardcoded colors that don't respond to theme changes.

---

## What Was Built (DONE, don't redo)

### New files created
```
frontend/src/themes/
  tokens/
    colors.js        ← declares all CSS var names + static tokens (methods, json colors)
    typography.js    ← font token names + static size vars
  presets/
    themes.js        ← 3 color presets (light, dark, deep-dark) + THEME_META for UI
    fonts.js         ← 4 font presets (inter, geist, system, jetbrains) + FONT_META
  index.js           ← applyPreset(), applyPresetToElement(), loadPreferences()

frontend/src/components/
  ThemeContext.jsx          ← replaces ThemeProvider.jsx. Has legacy shim: useTheme().theme still works.
  ThemePanel/
    ThemePanel.jsx          ← live preview panel, Colors tab + Font tab, hover preview
    ThemePanel.module.css   ← panel layout + mini mockup styles
```

### Files modified
- `Layout/Header/components/ThemeToggle.jsx` — now opens ThemePanel instead of old dropdown
- `main.jsx` — imports from ThemeContext.jsx instead of ThemeProvider.jsx
- `RequestPanel/RequestPanel.jsx` — import updated to ThemeContext.jsx
- `styles/global.css` — removed [data-theme="light"] and [data-theme="deep-dark"] blocks. :root is now fallback-only. JS owns all theme values at runtime via inline style properties on <html>.

### Old file (DO NOT DELETE — legacy consumers might still reference it)
- `ThemeProvider.jsx` — still exists, but nothing imports it now. Safe to delete after verifying.

---

## How the theme engine works

```
ThemeContext.jsx
  → on mount / preference change: calls applyPreset(preferences)
  → applyPreset() merges: STATIC_COLOR_TOKENS + STATIC_TYPOGRAPHY_TOKENS + colorPreset + fontPreset
  → sets each token via: document.documentElement.style.setProperty(key, value)
  → also sets: data-theme="dark" / data-font="inter" attributes on <html>
  → persists to localStorage key: "polaris-preferences"
  → format: { theme: "dark", font: "inter" }
```

**Critical:** localStorage key changed from `"theme"` (old) to `"polaris-preferences"` (new JSON object). Old users will get default theme on first load — intentional.

---

## What's BROKEN / Incomplete

### Problem: 9 CSS files still have hardcoded colors
These don't respond to theme switching because they bypass CSS vars.

**Exact remaining hardcoded values and their replacements:**

#### `ApiForm/ApiForm.module.css`
```
line 252: rgba(76, 175, 80, 0.2)   → var(--success-bg-strong)
line 257: rgba(244, 67, 54, 0.2)   → var(--error-bg-strong)
line 262: rgba(255, 152, 0, 0.2)   → var(--warning-bg-dim)
line 263: #ff9800                   → var(--warning)
line 318: #888                      → var(--text-muted)
line 325: #888                      → var(--text-muted)
line 509: rgba(76, 175, 80, 0.1)   → var(--success-bg-dim)
line 514: rgba(244, 67, 54, 0.1)   → var(--error-bg-dim)
line 519: rgba(255, 193, 7, 0.1)   → var(--warning-bg-dim)
line 520: #ffc107                   → var(--warning)
line 714: #666                      → var(--text-muted)
line 746: rgba(76, 175, 80, 0.2)   → var(--success-bg-strong)
line 748: rgba(76, 175, 80, 0.4)   → var(--success-border-dim)
line 752: rgba(244, 67, 54, 0.2)   → var(--error-bg-strong)
line 754: rgba(244, 67, 54, 0.4)   → var(--error-border-dim)
```

#### `BulkTestPanel/BulkTestPanel.module.css`
```
line 1068: #e7f0ff    → var(--badge-info-bg)
line 1069: #1a4f8a    → var(--badge-info-text)
line 1070: #b3d1ff    → var(--badge-info-border)
line 1125: #c00       → var(--error)
line 1133: #900       → var(--error)   (darker shade — use var(--error) or keep as-is, it's subtle)
```

#### `EnvironmentManager/EnvironmentDetail.module.css`
These are badge colors with separate light/dark values. The CSS file currently has
both `[data-theme="dark"]` overrides AND hardcoded light-mode values as defaults.
Replace the whole block with CSS vars from `--badge-*` tokens:
```
line 375-377: .type_secret (light)     → --badge-error-bg, --badge-error-text, --badge-error-border
line 380-382: .type_number (light)     → --badge-info-bg, --badge-info-text, --badge-info-border
line 385-387: .type_boolean (light)    → --badge-success-bg, --badge-success-text, --badge-success-border
line 390-392: .type_json (light)       → --badge-purple-bg, --badge-purple-text, --badge-purple-border
lines 395-413: [data-theme="dark"] overrides → DELETE entirely (JS handles this now via --badge-* vars per theme)
line 478: rgba(220, 38, 38, 0.08)     → var(--error-bg-subtle)
```
**IMPORTANT:** After replacing with --badge-* vars, DELETE the [data-theme="dark"] blocks at lines 395-413.
The badge vars are already set correctly per theme by the JS engine.

#### `TestCaseForm/TestCaseForm.module.css`
```
line 67: rgba(255, 255, 255, 0.1)   → var(--surface-3)  (used for hover on dark bg)
line 84: rgba(244, 67, 54, 0.1)     → var(--error-bg-dim)
```

#### `TestResultFocusModal/TestResultFocusModal.module.css`
```
line 5:   rgba(0, 0, 0, 0.75)       → var(--overlay-bg)
line 189: rgba(239, 68, 68, 0.05)   → var(--error-bg-subtle)
line 193: rgba(239, 68, 68, 0.1)    → var(--error-bg-dim)
```

#### `TestRunner/TestRunner.module.css`
```
line 61:  rgba(244, 67, 54, 0.1)    → var(--error-bg-dim)
line 338: rgba(244, 67, 54, 0.05)   → var(--error-bg-subtle)
```

#### `common/JsonEditor/JsonEditor.module.css`
These are in `[data-theme="dark"]` and `[data-theme="light"]` selector blocks.
Replace with the new CSS vars AND delete the [data-theme] blocks:
```
line 199-201: [data-theme="dark"] .textarea  background #1a1a1a → var(--json-editor-bg)
line 203-205: [data-theme="dark"] .textarea:focus  background #0f0f0f → var(--json-editor-bg-deeper)
line 207-210: [data-theme="light"] .textarea  background #fafafa → var(--json-editor-bg), border #e5e7eb → var(--json-editor-border)
```
Rewrite as: `.textarea { background: var(--json-editor-bg); border-color: var(--json-editor-border); }`
and `.textarea:focus { background: var(--json-editor-bg-deeper); }` — no theme selectors needed.

#### `common/VariableTextarea.module.css`
```
line 61: rgba(34, 197, 94, 0.25)    → var(--success-bg-strong)
line 62: rgba(34, 197, 94, 0.5)     → var(--success-border-dim)
line 66: rgba(239, 68, 68, 0.25)    → var(--error-bg-strong)
line 67: rgba(239, 68, 68, 0.5)     → var(--error-border-dim)
```

#### `ThemePanel/ThemePanel.module.css`
```
line 8: box-shadow: 0 8px 32px rgba(0, 0, 0, 0.28), 0 2px 8px rgba(0, 0, 0, 0.16)
```
This one is intentionally a fixed shadow (not theme-dependent). LEAVE IT as-is.

---

## CSS Variables Reference (all defined in themes/presets/themes.js + global.css :root fallback)

```
--overlay-bg           modal backdrop
--error-bg-subtle      rgba error, 5% opacity
--error-bg-dim         rgba error, 10% opacity  
--error-bg-strong      rgba error, 20% opacity
--error-border-dim     rgba error border, 40% opacity
--success-bg-dim       rgba success, 10%
--success-bg-strong    rgba success, 20%
--success-border-dim   rgba success border, 40%
--warning-bg-dim       rgba warning, 10%
--badge-error-bg/text/border
--badge-info-bg/text/border
--badge-success-bg/text/border
--badge-purple-bg/text/border
--json-editor-bg       dark editor background
--json-editor-bg-deeper darker on focus
--json-editor-border   editor border
```

---

## ThemePanel UI — Known Issues to Fix

1. **Preview pane doesn't reset on mouse-leave** — when hovering a theme card and moving away, preview snaps back but there's a flicker. Fix: add CSS `transition: background 0.1s` to `.mockupSidebar`, `.mockupMain` etc. in ThemePanel.module.css.

2. **Font tab preview doesn't show font change clearly** — the mockup uses tiny divs that don't show font differences. Add a small text label in the preview pane that renders `"GET /api/users"` using `var(--font-ui)` so font changes are visible.

3. **No close button** — panel closes on outside click only. Consider adding an X in the panel header.

4. **Panel clips on small screens** — `width: 560px` will overflow viewport on small windows. Add `max-width: calc(100vw - 32px)` to `.panel`.

---

## File Map (what owns what)

| Need | Touch |
|------|-------|
| Add new color theme | `themes/presets/themes.js` → add object to THEME_PRESETS + entry to THEME_META |
| Add new font preset | `themes/presets/fonts.js` → FONT_PRESETS + FONT_META |
| Add new tab category (density etc) | `themes/tokens/<new>.js` + `themes/presets/<new>.js` + `themes/index.js` (one merge line) + `ThemePanel.jsx` TABS array |
| Change panel layout/design | `ThemePanel/ThemePanel.module.css` only |
| Change preview mockup | `ThemePanel/ThemePanel.jsx` PreviewMockup component only |
| Wire new preference to app | `ThemeContext.jsx` state shape + `themes/index.js` applyPreset merge |

---

## Build Status
`npm run build` — passes clean as of this session. No TypeScript errors (project uses JSX not TSX).

## Dev Server
```bash
cd frontend && npm run dev
```

---

## How to Verify Theme is Working After Fixes
1. Open app, click moon/sun icon in header
2. Appearance panel opens with Colors + Font tabs
3. Hover a theme card → preview pane on RIGHT should update colors live
4. Click theme → entire app UI should switch: background, buttons, inputs, badges, modals
5. Refresh page → should restore chosen theme (persisted in localStorage["polaris-preferences"])
6. Switch to Light → check: badges in EnvironmentManager should be light-colored (white/pastel), not dark
