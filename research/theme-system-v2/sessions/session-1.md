# Session 1 — Token Taxonomy + Primitive Layer Refactor

**Goal:** Restructure the token system foundation. No visual changes yet — this is pure architecture. After this session the build still passes, the app still looks identical, but the token system is ready for Sessions 2-7.

**Prerequisites:** None. Start here.

**Do NOT change any color values in this session.** That is Session 2.

---

## Context

Current state:
- `frontend/src/themes/tokens/colors.js` — lists token names only, no values
- `frontend/src/themes/tokens/typography.js` — lists token names + static size values
- `frontend/src/themes/presets/themes.js` — 3 themes (light, dark, deep-dark) with flat token maps
- `frontend/src/themes/presets/fonts.js` — 4 font presets
- `frontend/src/themes/index.js` — merges color + font presets and applies to :root
- `frontend/src/styles/global.css` — has 30+ backward compat aliases that are dead weight

Problem: everything is in one flat tier. There is no primitive layer, no component-scoped layer. You can't override a button's color without changing the accent for the whole app.

---

## Task 1: Create new token files for missing dimensions

Create these 4 new files. They should follow the exact same pattern as `tokens/colors.js` (export token key array + static fallback object).

### `frontend/src/themes/tokens/spacing.js`
```js
export const SPACING_TOKEN_KEYS = [
  '--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6',
];

export const STATIC_SPACING_TOKENS = {};
// No static spacing tokens — all values owned by presets
```

### `frontend/src/themes/tokens/radius.js`
```js
export const RADIUS_TOKEN_KEYS = [
  '--radius-sm', '--radius', '--radius-md', '--radius-lg', '--radius-xl',
];

export const STATIC_RADIUS_TOKENS = {};
```

### `frontend/src/themes/tokens/shadow.js`
```js
export const SHADOW_TOKEN_KEYS = [
  '--shadow-sm', '--shadow-md', '--shadow-lg',
];

export const STATIC_SHADOW_TOKENS = {};
```

### `frontend/src/themes/tokens/motion.js`
```js
export const MOTION_TOKEN_KEYS = [
  '--duration-fast', '--duration-base', '--duration-slow', '--easing-default', '--easing-spring',
];

export const STATIC_MOTION_TOKENS = {};
```

---

## Task 2: Create preset files for each new dimension

### `frontend/src/themes/presets/spacing.js`
```js
export const SPACING_PRESETS = {
  compact: {
    '--space-1': '3px', '--space-2': '6px', '--space-3': '9px',
    '--space-4': '12px', '--space-5': '16px', '--space-6': '20px',
  },
  default: {
    '--space-1': '4px', '--space-2': '8px', '--space-3': '12px',
    '--space-4': '16px', '--space-5': '20px', '--space-6': '24px',
  },
  comfortable: {
    '--space-1': '5px', '--space-2': '10px', '--space-3': '16px',
    '--space-4': '20px', '--space-5': '28px', '--space-6': '36px',
  },
};

export const SPACING_META = [
  { id: 'compact',     label: 'Compact',     description: 'Denser · More content' },
  { id: 'default',     label: 'Default',     description: 'Balanced · Standard' },
  { id: 'comfortable', label: 'Comfortable', description: 'Airy · More breathing room' },
];
```

### `frontend/src/themes/presets/radius.js`
```js
export const RADIUS_PRESETS = {
  sharp: {
    '--radius-sm': '2px', '--radius': '3px', '--radius-md': '4px',
    '--radius-lg': '6px', '--radius-xl': '8px',
  },
  default: {
    '--radius-sm': '4px', '--radius': '6px', '--radius-md': '8px',
    '--radius-lg': '10px', '--radius-xl': '16px',
  },
  rounded: {
    '--radius-sm': '6px', '--radius': '10px', '--radius-md': '14px',
    '--radius-lg': '16px', '--radius-xl': '24px',
  },
};

export const RADIUS_META = [
  { id: 'sharp',   label: 'Sharp',   description: 'Minimal · Technical' },
  { id: 'default', label: 'Default', description: 'Balanced' },
  { id: 'rounded', label: 'Rounded', description: 'Friendly · Soft' },
];
```

### `frontend/src/themes/presets/shadow.js`
```js
export const SHADOW_PRESETS = {
  flat: {
    '--shadow-sm': 'none',
    '--shadow-md': 'none',
    '--shadow-lg': 'none',
  },
  default: {
    '--shadow-sm': '0 1px 2px rgba(0,0,0,0.12)',
    '--shadow-md': '0 2px 8px rgba(0,0,0,0.16)',
    '--shadow-lg': '0 4px 16px rgba(0,0,0,0.2)',
  },
  elevated: {
    '--shadow-sm': '0 2px 4px rgba(0,0,0,0.2)',
    '--shadow-md': '0 4px 16px rgba(0,0,0,0.28)',
    '--shadow-lg': '0 8px 32px rgba(0,0,0,0.36)',
  },
};

export const SHADOW_META = [
  { id: 'flat',     label: 'Flat',     description: 'No depth · Clean' },
  { id: 'default',  label: 'Default',  description: 'Subtle depth' },
  { id: 'elevated', label: 'Elevated', description: 'Strong depth' },
];
```

### `frontend/src/themes/presets/motion.js`
```js
export const MOTION_PRESETS = {
  none: {
    '--duration-fast': '0ms',
    '--duration-base': '0ms',
    '--duration-slow': '0ms',
    '--easing-default': 'linear',
    '--easing-spring': 'linear',
  },
  subtle: {
    '--duration-fast': '80ms',
    '--duration-base': '120ms',
    '--duration-slow': '180ms',
    '--easing-default': 'cubic-bezier(0.16, 1, 0.3, 1)',
    '--easing-spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  full: {
    '--duration-fast': '100ms',
    '--duration-base': '160ms',
    '--duration-slow': '260ms',
    '--easing-default': 'cubic-bezier(0.16, 1, 0.3, 1)',
    '--easing-spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
};

export const MOTION_META = [
  { id: 'none',   label: 'None',   description: 'Instant · No animation' },
  { id: 'subtle', label: 'Subtle', description: 'Quick · Understated' },
  { id: 'full',   label: 'Full',   description: 'Fluid · Expressive' },
];
```

---

## Task 3: Update `themes/index.js`

Rewrite to merge all 6 dimension presets. Update `DEFAULT_PREFERENCES` to include the new axes.

```js
import { STATIC_COLOR_TOKENS } from './tokens/colors.js';
import { STATIC_TYPOGRAPHY_TOKENS } from './tokens/typography.js';
import { THEME_PRESETS } from './presets/themes.js';
import { FONT_PRESETS } from './presets/fonts.js';
import { SPACING_PRESETS } from './presets/spacing.js';
import { RADIUS_PRESETS } from './presets/radius.js';
import { SHADOW_PRESETS } from './presets/shadow.js';
import { MOTION_PRESETS } from './presets/motion.js';

export const DEFAULT_PREFERENCES = {
  theme: 'dark',
  font: 'inter',
  spacing: 'default',
  radius: 'default',
  shadow: 'flat',
  motion: 'subtle',
};

function loadPreferences() {
  try {
    const stored = localStorage.getItem('polaris-preferences');
    return stored ? { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) } : { ...DEFAULT_PREFERENCES };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

function savePreferences(prefs) {
  try {
    localStorage.setItem('polaris-preferences', JSON.stringify(prefs));
  } catch {}
}

export function applyPreset(preferences) {
  const prefs = { ...DEFAULT_PREFERENCES, ...preferences };

  const merged = {
    ...STATIC_COLOR_TOKENS,
    ...STATIC_TYPOGRAPHY_TOKENS,
    ...(THEME_PRESETS[prefs.theme] ?? THEME_PRESETS.dark),
    ...(FONT_PRESETS[prefs.font] ?? FONT_PRESETS.inter),
    ...(SPACING_PRESETS[prefs.spacing] ?? SPACING_PRESETS.default),
    ...(RADIUS_PRESETS[prefs.radius] ?? RADIUS_PRESETS.default),
    ...(SHADOW_PRESETS[prefs.shadow] ?? SHADOW_PRESETS.flat),
    ...(MOTION_PRESETS[prefs.motion] ?? MOTION_PRESETS.subtle),
  };

  const root = document.documentElement;
  for (const [key, value] of Object.entries(merged)) {
    root.style.setProperty(key, value);
  }

  root.setAttribute('data-theme', prefs.theme);
  root.setAttribute('data-font', prefs.font);
  root.setAttribute('data-spacing', prefs.spacing);
  root.setAttribute('data-radius', prefs.radius);
  root.setAttribute('data-shadow', prefs.shadow);
  root.setAttribute('data-motion', prefs.motion);

  savePreferences(prefs);
  return prefs;
}

export function applyPresetToElement(element, preferences) {
  const prefs = { ...DEFAULT_PREFERENCES, ...preferences };

  const merged = {
    ...(THEME_PRESETS[prefs.theme] ?? THEME_PRESETS.dark),
    ...(FONT_PRESETS[prefs.font] ?? FONT_PRESETS.inter),
    ...(SPACING_PRESETS[prefs.spacing] ?? SPACING_PRESETS.default),
    ...(RADIUS_PRESETS[prefs.radius] ?? RADIUS_PRESETS.default),
    ...(SHADOW_PRESETS[prefs.shadow] ?? SHADOW_PRESETS.flat),
    ...(MOTION_PRESETS[prefs.motion] ?? MOTION_PRESETS.subtle),
  };

  for (const [key, value] of Object.entries(merged)) {
    element.style.setProperty(key, value);
  }
}

export { loadPreferences, THEME_PRESETS, FONT_PRESETS };
export { THEME_META } from './presets/themes.js';
export { FONT_META } from './presets/fonts.js';
export { SPACING_META } from './presets/spacing.js';
export { RADIUS_META } from './presets/radius.js';
export { SHADOW_META } from './presets/shadow.js';
export { MOTION_META } from './presets/motion.js';
```

---

## Task 4: Remove static spacing/radius/shadow from `global.css`

In `frontend/src/styles/global.css`, remove these lines from `:root` (they are now owned by presets):
```css
/* DELETE these — now in SPACING_PRESETS: */
--space-1: 4px; through --space-6: 24px;

/* DELETE these — now in RADIUS_PRESETS: */
--radius-sm: 6px; through --radius-xl: 16px;

/* DELETE these — now in SHADOW_PRESETS: */
--shadow-sm: none; through --shadow-lg: none;
```

Add the motion token fallbacks (these are NEW to global.css):
```css
/* Motion — JS sets these, fallback is 'subtle' */
--duration-fast: 80ms;
--duration-base: 120ms;
--duration-slow: 180ms;
--easing-default: cubic-bezier(0.16, 1, 0.3, 1);
--easing-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

Also add spacing + radius + shadow fallbacks matching 'default' preset values (JS will override on mount, these are just FOUC prevention):
```css
--space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 20px; --space-6: 24px;
--radius-sm: 4px; --radius: 6px; --radius-md: 8px; --radius-lg: 10px; --radius-xl: 16px;
--shadow-sm: none; --shadow-md: none; --shadow-lg: none;
```

---

## Task 5: Add component token keys to `tokens/colors.js`

At the end of `COLOR_TOKEN_KEYS` array in `frontend/src/themes/tokens/colors.js`, add:

```js
// Component tokens — Tier 3 (values set per theme in presets/themes.js)
// Button
'--btn-primary-bg', '--btn-primary-text', '--btn-primary-hover',
'--btn-secondary-bg', '--btn-secondary-border',
'--btn-danger-bg', '--btn-danger-hover',
'--btn-ghost-hover',

// Input
'--input-bg', '--input-border', '--input-focus-border',
'--input-text', '--input-placeholder',

// Badge (rename --badge-purple-* → --badge-special-*)
'--badge-special-bg', '--badge-special-text', '--badge-special-border',
// Keep existing --badge-error/success/warning/info/neutral

// Sidebar
'--sidebar-bg', '--sidebar-border', '--sidebar-icon', '--sidebar-icon-active', '--sidebar-active-bg',

// Panel
'--panel-bg', '--panel-border', '--panel-header-bg',

// Code editor
'--code-bg', '--code-bg-deeper', '--code-border', '--code-gutter-bg',
'--code-active-line', '--code-selection',

// Data viz (moved from STATIC — now themed)
'--viz-method-get', '--viz-method-post', '--viz-method-put',
'--viz-method-patch', '--viz-method-delete', '--viz-method-head', '--viz-method-options',
'--viz-json-key', '--viz-json-string', '--viz-json-number', '--viz-json-boolean', '--viz-json-null',
```

Also update `STATIC_COLOR_TOKENS` — the method and json tokens are NO LONGER static. Remove them from `STATIC_COLOR_TOKENS`. They will be defined per-theme in Session 2.

---

## Task 6: Update `ThemeContext.jsx`

Add the new preference keys so the context shape is complete. No behavior change — just adding to DEFAULT_PREFERENCES which is now imported from index.js.

The context value should expose all preferences, not just `theme`. Add `spacing`, `radius`, `shadow`, `motion` to the value object so components can read them if needed.

---

## Acceptance Criteria

- [ ] `npm run build` passes with 0 errors
- [ ] App loads and looks identical to before this session
- [ ] `localStorage['polaris-preferences']` includes `spacing`, `radius`, `shadow`, `motion` keys after first load
- [ ] `document.documentElement.style` shows `--duration-fast`, `--space-1`, `--radius-sm` etc set by JS
- [ ] 6 new files created: `tokens/spacing.js`, `tokens/radius.js`, `tokens/shadow.js`, `tokens/motion.js`, `presets/spacing.js`, `presets/radius.js`, `presets/shadow.js`, `presets/motion.js`
- [ ] `STATIC_COLOR_TOKENS` no longer contains `--method-*` or `--json-*` tokens (they move to themes.js in Session 2)
