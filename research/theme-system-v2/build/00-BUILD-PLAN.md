# Polaris Theme System v2 — BUILD PLAN (Forge-parity)

> **Single source of truth for implementation.** Every phase below is a standalone spec.
> An implementer (any session/agent) reads the relevant phase file in `build/` **and nothing
> else**, builds only that phase, then ticks it here. Do not re-derive scope from older
> `sessions/*.md` — those are superseded where they conflict (esp. backend path/conventions).

---

## Mission

Rebuild Polaris (API tester) theming to match the **Forge** Figma mockups
(`reference/Full UI Design Tabs/`, `research/theme-system-v2/*.html`) with **all major CSS
driven by theme CSS variables** (the token law). Ship real, working, end-to-end features —
no stubs, no placeholders.

**Quality bar:** Linear / GitHub / Vercel / Raycast. Flat surfaces, hairline borders, strong
hierarchy, subtle depth, long-session comfort. **Avoid:** neon, glassmorphism, heavy shadows.

---

## The token law (non-negotiable)

1. Components read **tokens, never literals**. No `#hex`, no `8px` radius, no `0 4px 12px`
   shadow, no `0.2s` transition inside a component CSS module. Only `var(--token)`.
2. Every visual decision is a CSS custom property declared once (token registry below).
3. A theme = a set of token values. Theme switch = rewrite vars on `:root`. Nothing remounts.
4. The settings UI **dogfoods the tokens** — it restyles with the preview.
5. **Only** allowed literals: decorative traffic-light dots, `border-radius:50%`/`9999px`
   (circles/pills), the ThemePanel/modal drop shadow (intentional chrome, commented).

---

## Scope (locked)

**IN — 11 axes:** Color theme · Accent · Typography (UI font) · Code font · Density (spacing) ·
Radius · Shadow · Motion · Code editor (syntax theme) · Accessibility · Advanced/Custom editor.

**IN — 3 screens:** Appearance panel (all tabs) · Theme Builder (full-screen token editor) ·
Marketplace (community theme grid + Install).

**IN — backend:** full persistence (save / load / activate custom themes) in the **real**
backend `backend/src/` (NOT `mes_api_gateway`).

**OUT (dropped):** Icon-set swap · per-component style variants · Layout shell presets ·
Charts color themes.

---

## Architecture — 3-tier token model

```
Tier 1 PRIMITIVE  raw values, owned per theme        (folded into Tier 2 here)
Tier 2 SEMANTIC   purpose-mapped                      --accent, --surface-1, --text
Tier 3 COMPONENT  scoped, overridable per theme       --btn-primary-bg, --sidebar-bg
```

Engine = `frontend/src/themes/index.js`:
- `applyPreset(preferences, customOverrides?)` → resolves all layers, writes to `:root`, persists.
- `applyPresetToElement(el, preferences, customOverrides?)` → scoped preview, no persist.
- `resolveTokens(prefs, customOverrides)` → the flat merged map (exported for reuse).

**Merge order (later wins):** static → typography → color theme → **accent override** → UI font
→ code font → spacing → radius → shadow → motion → editor(syntax) → a11y → **customTheme overrides**.

`DEFAULT_PREFERENCES`:
`{ theme, accent, font, codeFont, spacing, radius, shadow, motion, editor, a11y, customTheme }`.

Persistence key: `localStorage['polaris-preferences']`. Custom themes: backend (Phase H) with
`localStorage['polaris-custom-themes']` fallback when logged out.

---

## File map

```
frontend/src/themes/
  tokens/   colors.js  typography.js  spacing.js  radius.js  shadow.js  motion.js   (key registries)
  presets/  themes.js  fonts.js  accents.js  codeFonts.js  spacing.js  radius.js
            shadow.js  motion.js  editorThemes.js  a11y.js                          (value maps + *_META)
  customTheme.js        ← shared contrast/derive/export helpers (Phase E)
  index.js              ← engine: resolveTokens / applyPreset / applyPresetToElement + barrel
frontend/src/components/
  ThemeContext.jsx                          ← prefs state + backend active-theme fetch (Phase H)
  ThemePanel/  ThemePanel.jsx + .module.css ← Appearance panel, 11 tabs (Phase D)
               CustomThemeEditor.jsx + .module.css                                  (Phase E)
  ThemeBuilder/ ThemeBuilder.jsx + .module.css                                       (Phase F)
  Marketplace/  Marketplace.jsx  ThemeCard.jsx + .module.css                         (Phase G)
frontend/src/data/  marketplaceThemes.js                                            (Phase G)
frontend/src/styles/global.css             ← token-law audit, alias cleanup (Phase C)
backend/src/  models.py  schema.py  routers/themes/*  main.py                        (Phase H)
```

---

## Token registry (authoritative names)

**Semantic:** `--bg --surface-1 --surface-2 --surface-3 --border --border-subtle --border-strong
--border-focus --text --text-subtle --text-muted --text-disabled --accent --accent-hover
--accent-dim --accent-text --success --warning --error --info` (+ each status `-dim`,
`-bg-subtle/-dim/-strong`, `-border`) `--overlay-bg --scrollbar-thumb --scrollbar-thumb-hover`.

**Component:** `--btn-primary-bg/-text/-hover --btn-secondary-bg/-border --btn-danger-bg/-hover
--btn-ghost-hover --input-bg/-border/-focus-border/-text/-placeholder --sidebar-bg/-border/-icon/
-icon-active/-active-bg --panel-bg/-border/-header-bg --code-bg/-bg-deeper/-border/-gutter-bg/
-active-line/-selection`.

**Badge:** `--badge-{error,success,warning,info,neutral,special}-{bg,text,border}`
(`special` replaces the old `purple`; distinct hue per theme: light=teal, dark=cyan,
deep-dark=rose, midnight=violet, ember=gold).

**Data viz:** `--viz-method-{get,post,put,patch,delete,head,options}`
`--viz-json-{key,string,number,boolean,null}`. (Back-compat aliases `--method-*`/`--json-*`
point at these in `global.css` until Phase C migrates call sites.)

**Dimensions:** `--space-1..6` (density) · `--radius-sm/--radius/-md/-lg/-xl` ·
`--shadow-sm/-md/-lg` · `--duration-fast/-base/-slow` + `--easing-default/-spring` (motion).

**Typography:** `--font-ui --font-mono --text-xs/-sm/-base/-md/-lg --line-height`.

**A11y:** `--focus-ring` (+ highcontrast remaps `--border→--border-strong` etc; largetext scales `--text-*`).

---

## Status / task board

| Phase | Deliverable | Spec file | Status |
|---|---|---|---|
| A | Token foundation + new axis presets + engine rewrite | `A-token-foundation.md` | ✅ DONE |
| B | 5 color themes, 3-tier tokens, color fixes | `B-color-presets.md` | ✅ DONE |
| C | CSS token-law audit (transitions/radius/shadow/component tokens, kill 24 hex, drop `--p0-*`) | `C-css-token-audit.md` | ✅ DONE |
| D | Appearance panel overhaul — 11 tabs + richer preview | `D-appearance-panel.md` | ✅ DONE |
| E | Custom theme editor (Custom tab) + shared `customTheme.js` | `E-custom-editor.md` | ✅ DONE |
| F | Theme Builder full screen | `F-theme-builder.md` | ✅ DONE |
| G | Marketplace screen + seed themes | `G-marketplace.md` | ✅ DONE |
| H | Backend persistence (real backend conventions) + wiring | `H-backend-persistence.md` | ✅ DONE |

**Order:** A→B done. C unblocks visible token control. D needs A/B. E needs D. F/G reuse E's
helpers. H needs E. C is independent of D/E/F/G and can run in parallel.

---

## Global Definition of Done

- [ ] `cd frontend && npm run build` → 0 errors after every phase.
- [ ] No hardcoded color/px/transition in `components/**` except the documented exceptions.
- [ ] Switching any of the 11 axes visibly changes both the settings UI and the app.
- [ ] Export → Import round-trips an identical theme; reload restores from storage/backend.
- [ ] Keyboard focus visible; `prefers-reduced-motion` + Motion=None honored; high-contrast & large-text pass.
- [ ] Backend: save/activate/load works cross-device; logged-out falls back to localStorage (no 401 break).
```
