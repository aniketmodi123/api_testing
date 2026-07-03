# Polaris Design System v2 — Master Plan

**Status:** Planning  
**Audience:** Frontend engineer implementing across 5-7 sessions  
**Stack:** React + CSS Modules + Vite + CSS custom properties (no Tailwind, no CSS-in-JS)

---

## The Problems (exact audit findings)

### 1. Purple bleeds everywhere — it's not themed, it's hardcoded

`STATIC_COLOR_TOKENS` (colors.js) holds `--method-patch: #a371f7` and `--json-boolean: #a371f7` as static values that **never change between themes**. These are GitHub dark-mode colors baked into a system that now has a light theme. In light mode, `#a371f7` on `#f6f8fa` fails contrast (3.1:1 < 4.5:1 required). The purple badge (`--badge-purple-*`) compounds this with a purple-on-purple identity that makes every theme feel like it has a "purple problem."

### 2. Accent colors are oversaturated

| Token | Current value | Issue |
|---|---|---|
| `--accent` (dark) | `#6c72ff` | 100% sRGB saturation. Glaring on dark bg. |
| `--accent` (light) | `#4f6ef7` | High chroma. Clash with the gray light bg. |
| `--success` (dark) | `#4ac26b` | Bright lime-green. Too high luminance for dark UI. |
| `--error` (dark) | `#f05d56` | Near-100% saturation red. Harsh. |
| `--badge-error-text` | `#fc8181` | Very bright pink-red on already-red bg. Contrast ≈ 3.8:1. |

### 3. No component-level control

User wants to change button color independently from sidebar color independently from badge color. Currently everything derives from `--accent` with no override path.

### 4. Missing entire token dimensions

- No spacing presets (compact / comfortable)
- No radius presets (sharp / default / rounded)
- Shadow system: all `none` — no depth whatsoever
- No motion tokens
- Syntax highlighting tokens (method colors, JSON colors) are theme-static — broken in light mode

### 5. Structural debt in global.css

30+ backward-compat aliases (`--p0-*`, `--primary`, `--background`, `--background-lighter`, etc.). These are dead weight that make it impossible to know which tokens the UI actually uses. Session 4 cleans these up.

---

## Architecture: Three-Tier Token System

```
Tier 1 — PRIMITIVE tokens        Raw values. Owned by each theme preset.
          --prim-blue-500: #4361ee
          --prim-neutral-900: #1a1d24

Tier 2 — SEMANTIC tokens         Purpose-mapped. Reference Tier 1 via var().
          --accent: var(--prim-blue-500)
          --surface-1: var(--prim-neutral-900)

Tier 3 — COMPONENT tokens        Scoped. Override independently per theme.
          --btn-primary-bg: var(--accent)
          --badge-error-bg: var(--prim-red-950)
```

Tier 1 is defined **inside** each theme preset (THEME_PRESETS object). Tier 2 and 3 reference Tier 1. This means a theme can change `--prim-blue-500` and all buttons, accents, focus rings update automatically — but badge colors can also deviate by pointing to a different primitive.

---

## Complete Token Registry

### Tier 1 — Primitives (defined per theme)

Each theme defines a full primitive palette:

```
Neutrals (9 steps)
--prim-neutral-0    pure white / near-white
--prim-neutral-50   page background light
--prim-neutral-100  panel / card background
--prim-neutral-200  elevated surface
--prim-neutral-300  border light
--prim-neutral-400  border default
--prim-neutral-500  muted text
--prim-neutral-700  body text
--prim-neutral-900  heading / high contrast
--prim-neutral-950  deepest bg (dark themes)

Brand / Accent (per theme, 3 stops)
--prim-accent-300   dim / hover dim
--prim-accent-500   primary accent
--prim-accent-700   hover / pressed

Status (per theme — adapts contrast per bg)
--prim-green-500    success
--prim-amber-500    warning
--prim-red-500      error
--prim-blue-500     info (may equal accent)
--prim-purple-500   special / badge-purple substitute (different per theme)
```

### Tier 2 — Semantic Tokens

```
SURFACE
--bg               page canvas
--surface-1        primary panel / sidebar bg
--surface-2        elevated surface (cards, inputs)
--surface-3        hover state bg / muted fill

BORDER
--border           default border
--border-subtle    very faint separator
--border-focus     focus ring color (= --accent)

TEXT
--text             primary body text (≥ 4.5:1 on --bg)
--text-subtle      secondary label
--text-muted       placeholder / timestamps
--text-disabled    disabled state text

ACCENT
--accent           primary interactive color
--accent-hover     darker on hover
--accent-dim       10% opacity fill
--accent-text      text on --accent bg (always white or high contrast)

STATUS (each × 5 variants)
--success / --success-bg-subtle / --success-bg-dim / --success-bg-strong / --success-border
--warning / --warning-bg-subtle / --warning-bg-dim / --warning-bg-strong / --warning-border
--error   / --error-bg-subtle   / --error-bg-dim   / --error-bg-strong   / --error-border
--info    / --info-bg-subtle    / --info-bg-dim     / --info-bg-strong    / --info-border

UTILITY
--overlay-bg       modal/drawer backdrop
--scrollbar-thumb
--scrollbar-thumb-hover
```

### Tier 3 — Component Tokens

```
BUTTON
--btn-primary-bg        default: var(--accent)
--btn-primary-text      default: var(--accent-text)
--btn-primary-hover     default: var(--accent-hover)
--btn-secondary-bg      default: var(--surface-2)
--btn-secondary-border  default: var(--border)
--btn-danger-bg         default: var(--error)
--btn-danger-hover      default: (darker red)
--btn-ghost-hover       default: var(--surface-3)

INPUT
--input-bg              default: var(--surface-2)
--input-border          default: var(--border)
--input-focus-border    default: var(--accent)
--input-text            default: var(--text)
--input-placeholder     default: var(--text-muted)

BADGE
--badge-error-bg        per theme
--badge-error-text      per theme
--badge-error-border    per theme
--badge-success-bg      per theme
--badge-success-text    per theme
--badge-success-border  per theme
--badge-warning-bg      per theme
--badge-warning-text    per theme
--badge-warning-border  per theme
--badge-info-bg         per theme
--badge-info-text       per theme
--badge-info-border     per theme
--badge-neutral-bg      per theme
--badge-neutral-text    per theme
--badge-neutral-border  per theme
--badge-special-bg      replaces --badge-purple-* (different color per theme)
--badge-special-text    per theme
--badge-special-border  per theme

SIDEBAR
--sidebar-bg            default: var(--surface-1)
--sidebar-border        default: var(--border)
--sidebar-icon          default: var(--text-subtle)
--sidebar-icon-active   default: var(--accent)
--sidebar-active-bg     default: var(--accent-dim)

PANEL
--panel-bg              default: var(--bg)
--panel-border          default: var(--border)
--panel-header-bg       default: var(--surface-1)

CODE EDITOR
--code-bg               editor bg
--code-bg-deeper        focus bg
--code-border           border
--code-gutter-bg        line number bg
--code-active-line      active line highlight
--code-selection        text selection highlight

DATA VISUALIZATION (HTTP methods — NOW THEMED, not static)
--viz-method-get        green
--viz-method-post       blue
--viz-method-put        amber
--viz-method-patch      themed color (NOT always purple)
--viz-method-delete     red
--viz-method-head       blue
--viz-method-options    themed color (NOT always purple)

JSON SYNTAX (NOW THEMED)
--viz-json-key          blue variant per theme
--viz-json-string       green variant per theme
--viz-json-number       amber (consistent)
--viz-json-boolean      themed (not always purple)
--viz-json-null         red (consistent)
```

### Dimension Presets (non-color axes)

```
SPACING (scale multiplier applied to all --space-* vars)
compact:     --space-1:3px --space-2:6px --space-3:9px --space-4:12px --space-5:16px --space-6:20px
default:     --space-1:4px --space-2:8px --space-3:12px --space-4:16px --space-5:20px --space-6:24px
comfortable: --space-1:5px --space-2:10px --space-3:15px --space-4:20px --space-5:26px --space-6:32px

RADIUS (all --radius-* vars)
sharp:       --radius-sm:2px --radius:4px --radius-md:6px --radius-lg:8px --radius-xl:12px
default:     --radius-sm:4px --radius:6px --radius-md:8px --radius-lg:10px --radius-xl:16px
rounded:     --radius-sm:6px --radius:10px --radius-md:14px --radius-lg:16px --radius-xl:24px

SHADOW
flat:     --shadow-sm:none   --shadow-md:none   --shadow-lg:none
default:  --shadow-sm:0 1px 2px rgba(0,0,0,0.12)   --shadow-md:0 2px 8px rgba(0,0,0,0.16)   --shadow-lg:0 4px 16px rgba(0,0,0,0.2)
elevated: --shadow-sm:0 2px 4px rgba(0,0,0,0.2)    --shadow-md:0 4px 16px rgba(0,0,0,0.28)   --shadow-lg:0 8px 32px rgba(0,0,0,0.36)

MOTION
none:   --duration-fast:0ms --duration-base:0ms --duration-slow:0ms --easing-default:linear
subtle: --duration-fast:80ms --duration-base:120ms --duration-slow:180ms --easing-default:cubic-bezier(0.16,1,0.3,1)
full:   --duration-fast:100ms --duration-base:160ms --duration-slow:260ms --easing-default:cubic-bezier(0.16,1,0.3,1)
```

---

## Five Color Theme Presets (redesigned)

### Light (redesigned — less saturated accent)
```
Accent: #3b5bdb (blue, calmer than current #4f6ef7)
Badge-special: teal (#ebfafa / #0d7377 / #b2e4e5) — NOT purple
method-patch: #7048e8 (indigo, readable on white)
json-boolean: #6741d9 (indigo)
```

### Dark — Mid Dark (redesigned)
```
Accent: #748ffc (blue-violet, less harsh than #6c72ff)
Badge-special: teal (#063a3f / #67e8f9 / #155e75) — identity is cyan, NOT purple
method-patch: #cc5de8 (purple-pink, distinct from blue accent)
json-boolean: #cc5de8
```

### Deep Dark (redesigned)
```
Accent: #748ffc (same family as dark, slightly brighter for deeper bg)
Badge-special: rose (#3b0a16 / #fda4af / #881337) — identity is rose/pink, distinct from dark theme
method-patch: #e599f7
json-boolean: #e599f7
```

### Midnight (new)
```
bg: #030b13, surface-1: #071422, surface-2: #0c1e35
Accent: #00cbe8 (electric cyan)
badge-special: violet (#1a0a4a / #c084fc / #5b21b6)
method-patch: #818cf8 (indigo)
json-boolean: #818cf8
```

### Ember (new — warm dark)
```
bg: #110a08, surface-1: #1c130f, surface-2: #261a14
Accent: #f97316 (amber-orange)
Text: #f5ebe0 (warm white)
badge-special: gold (#3d2200 / #fbbf24 / #92400e)
method-patch: #c084fc (purple on warm bg reads as contrast, not bleed)
json-boolean: #c084fc
```

---

## Custom Theme Editor — UI Spec

### Where it lives
A new "Custom" tab in ThemePanel, only visible when user has a custom theme active OR clicks "Create custom theme".

### Controls (grouped)
```
Section: Surfaces & Background
  - Page background (color picker → --bg primitive)
  - Panel background (--surface-1)
  - Card background (--surface-2)

Section: Accent Color
  - Primary accent (--prim-accent-500 — drives buttons, links, focus rings)
  - Automatically derives hover (-20% lightness) and dim (10% opacity)

Section: Text
  - Body text color (--text) — shows live contrast ratio badge
  - Muted text (--text-muted)

Section: Status Colors
  - Success / Warning / Error (each a single color picker — variants auto-derive)

Section: Components (advanced, collapsed by default)
  - Button primary color (--btn-primary-bg override)
  - Sidebar background (--sidebar-bg override)
  - Badge palette (toggle: auto-derive from accent | manual per type)
```

### Live preview
Full-width preview mockup (same as ThemePanel but taller, 240px), updates on every picker change with no debounce.

### Save / Export
- Save to backend (if logged in) with a name input
- Export as JSON (the full token_map) for sharing
- Import JSON to restore

---

## Backend Persistence — Schema & API

### DB Table: `user_themes`
```sql
CREATE TABLE user_themes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  token_map   JSONB NOT NULL,   -- full flat map of CSS var → value
  is_active   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, name)
);
CREATE INDEX ON user_themes (user_id, is_active);
```

### API Endpoints (FastAPI)
```
GET    /themes                     list user's saved custom themes
POST   /themes                     create { name, token_map }
PUT    /themes/{id}                update { name?, token_map? }
DELETE /themes/{id}                delete
PUT    /themes/{id}/activate       set is_active=true, others false

GET    /themes/active              returns active custom theme (if any)
                                   ThemeContext calls this on login
```

### ThemeContext changes
On login/mount: `GET /themes/active` — if returns a theme, merge its token_map on top of the current preset. Custom theme overrides preset at Tier 3 level only.

localStorage still caches preset selection. Custom theme is fetched fresh and layered on top.

---

## Session Breakdown

| Session | Deliverable | Prerequisite | Est. effort |
|---|---|---|---|
| 1 | Token taxonomy + primitive layer | none | ~3h |
| 2 | Color preset redesign + 2 new themes | Session 1 | ~2h |
| 3 | Spacing / Radius / Shadow / Motion dimensions | Session 1 | ~2h |
| 4 | Component token layer + CSS audit all files | Sessions 1+2 | ~4h |
| 5 | ThemePanel UI overhaul | Sessions 2+3 | ~3h |
| 6 | Custom theme editor | Session 5 | ~4h |
| 7 | Backend persistence | Session 6 | ~3h |

Each session ships independently. Sessions 1-4 are build-order-critical. Sessions 5-7 are layered improvements that can be done in any order after 4.

---

## File Map After All Sessions

```
frontend/src/themes/
  tokens/
    colors.js        (REWRITTEN — full 3-tier token registry)
    typography.js    (extended — weight, line-height vars)
    spacing.js       (NEW — --space-* scale)
    radius.js        (NEW — --radius-* scale)
    shadow.js        (NEW — --shadow-* scale)
    motion.js        (NEW — --duration-*, --easing-* vars)
  presets/
    themes.js        (REWRITTEN — 5 themes, primitives + semantic + component tokens)
    fonts.js         (unchanged)
    spacing.js       (NEW — compact/default/comfortable presets)
    radius.js        (NEW — sharp/default/rounded presets)
    shadow.js        (NEW — flat/default/elevated presets)
    motion.js        (NEW — none/subtle/full presets)
  index.js           (UPDATED — merge all 6 preset categories)

frontend/src/components/
  ThemeContext.jsx   (UPDATED — backend fetch on mount)
  ThemePanel/
    ThemePanel.jsx   (REWRITTEN — tabs for all 6 dimensions)
    ThemePanel.module.css
    CustomThemeEditor.jsx   (NEW — session 6)
    CustomThemeEditor.module.css

frontend/src/styles/
  global.css         (CLEANED — remove all --p0-* aliases, add motion vars)

backend/src/ (session 7)
  routers/themes.py
  schemas/themes.py
  models/user_theme.py
```
