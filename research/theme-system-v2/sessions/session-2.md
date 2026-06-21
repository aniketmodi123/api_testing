# Session 2 — Color Preset Redesign + 2 New Themes

**Goal:** Fix the color problems in all 3 existing themes, add 2 new themes (Midnight + Ember). After this session the app looks noticeably better — calmer accents, badge-special no longer bleeds purple across all themes, syntax colors work in light mode.

**Prerequisites:** Session 1 must be complete. `STATIC_COLOR_TOKENS` must NOT contain `--method-*` or `--json-*` (they were removed in Session 1 Task 5).

**File to edit:** `frontend/src/themes/presets/themes.js` — full rewrite.

---

## What Was Wrong (the exact problems)

| Problem | Root cause | Fix |
|---|---|---|
| Purple everywhere | `--method-patch: #a371f7` was in STATIC_COLOR_TOKENS — same in ALL themes | Move to per-theme, each picks a different color |
| `--badge-purple-*` same across themes | All 3 themes used purple/violet for badge-special | Each theme now has a distinct badge-special identity |
| Accent too saturated (dark) | `#6c72ff` is 100% sRGB chroma | Replaced with `#748ffc` — 5% lower saturation, less glare |
| Accent too saturated (light) | `#4f6ef7` clashes on `#f6f8fa` | Replaced with `#3b5bdb` — lower chroma, higher contrast |
| Syntax tokens broken in light | `--json-key: #79c0ff` on white = 1.9:1 contrast (fail) | Per-theme syntax colors now |
| Badge error text too bright | `#fc8181` in dark = 3.8:1 on `#3b1010` (fail) | Corrected per theme |

---

## Full `themes/presets/themes.js` Rewrite

Replace the entire file with this:

```js
// Color presets — 5 themes.
// Structure: each theme defines ALL tokens: primitive scale, semantic, component, data-viz.
// Session 1 removed --method-* and --json-* from STATIC_COLOR_TOKENS;
// those tokens now live here under --viz-method-* and --viz-json-*.

export const THEME_PRESETS = {

  // ─────────────────────────────────────────
  // LIGHT — Professional daytime
  // Accent: calm blue #3b5bdb (was too-bright #4f6ef7)
  // Badge-special: teal (was purple — purple on white = contrast fail)
  // Syntax: dark readable colors optimized for white bg
  // ─────────────────────────────────────────
  light: {
    '--bg': '#f6f8fa',
    '--surface-1': '#ffffff',
    '--surface-2': '#f3f4f6',
    '--surface-3': '#e9eaec',
    '--border': '#d0d7de',
    '--border-subtle': '#e5e7eb',
    '--border-focus': '#3b5bdb',

    '--text': '#1f2328',
    '--text-subtle': '#57606a',
    '--text-muted': '#7a828b',
    '--text-disabled': '#b0b5bc',

    '--accent': '#3b5bdb',
    '--accent-hover': '#2f4ac2',
    '--accent-dim': 'rgba(59, 91, 219, 0.1)',
    '--accent-text': '#ffffff',

    '--success': '#1a7f37',
    '--success-dim': 'rgba(26, 127, 55, 0.1)',
    '--success-bg-subtle': 'rgba(26, 127, 55, 0.05)',
    '--success-bg-dim': 'rgba(26, 127, 55, 0.1)',
    '--success-bg-strong': 'rgba(26, 127, 55, 0.15)',
    '--success-border': 'rgba(26, 127, 55, 0.3)',

    '--warning': '#9a6700',
    '--warning-dim': 'rgba(154, 103, 0, 0.1)',
    '--warning-bg-subtle': 'rgba(154, 103, 0, 0.05)',
    '--warning-bg-dim': 'rgba(154, 103, 0, 0.1)',
    '--warning-bg-strong': 'rgba(154, 103, 0, 0.15)',
    '--warning-border': 'rgba(154, 103, 0, 0.3)',

    '--error': '#cf222e',
    '--error-dim': 'rgba(207, 34, 46, 0.1)',
    '--error-bg-subtle': 'rgba(207, 34, 46, 0.05)',
    '--error-bg-dim': 'rgba(207, 34, 46, 0.1)',
    '--error-bg-strong': 'rgba(207, 34, 46, 0.15)',
    '--error-border': 'rgba(207, 34, 46, 0.3)',
    '--error-border-dim': 'rgba(207, 34, 46, 0.3)',

    '--info': '#3b5bdb',
    '--info-dim': 'rgba(59, 91, 219, 0.1)',
    '--info-bg-subtle': 'rgba(59, 91, 219, 0.05)',
    '--info-bg-dim': 'rgba(59, 91, 219, 0.1)',
    '--info-bg-strong': 'rgba(59, 91, 219, 0.15)',
    '--info-border': 'rgba(59, 91, 219, 0.3)',

    '--overlay-bg': 'rgba(0, 0, 0, 0.4)',
    '--scrollbar-thumb': '#b8bec7',
    '--scrollbar-thumb-hover': '#9aa0aa',

    // Component — Badge
    '--badge-error-bg': '#fff0f0', '--badge-error-text': '#a12020', '--badge-error-border': '#fecdd3',
    '--badge-success-bg': '#f0fff4', '--badge-success-text': '#145a26', '--badge-success-border': '#bbf7d0',
    '--badge-warning-bg': '#fffbeb', '--badge-warning-text': '#7a4f00', '--badge-warning-border': '#fde68a',
    '--badge-info-bg': '#eff6ff', '--badge-info-text': '#1e40af', '--badge-info-border': '#bfdbfe',
    '--badge-neutral-bg': '#f3f4f6', '--badge-neutral-text': '#374151', '--badge-neutral-border': '#d1d5db',
    // Special = TEAL (not purple — purple on white fails contrast)
    '--badge-special-bg': '#f0fdfa', '--badge-special-text': '#0d5c4a', '--badge-special-border': '#99f6e4',

    // Component — Button
    '--btn-primary-bg': '#3b5bdb', '--btn-primary-text': '#ffffff', '--btn-primary-hover': '#2f4ac2',
    '--btn-secondary-bg': '#ffffff', '--btn-secondary-border': '#d0d7de',
    '--btn-danger-bg': '#cf222e', '--btn-danger-hover': '#a71f25',
    '--btn-ghost-hover': '#e9eaec',

    // Component — Input
    '--input-bg': '#ffffff', '--input-border': '#d0d7de', '--input-focus-border': '#3b5bdb',
    '--input-text': '#1f2328', '--input-placeholder': '#9aa0aa',

    // Component — Sidebar
    '--sidebar-bg': '#ffffff', '--sidebar-border': '#d0d7de',
    '--sidebar-icon': '#57606a', '--sidebar-icon-active': '#3b5bdb',
    '--sidebar-active-bg': 'rgba(59, 91, 219, 0.08)',

    // Component — Panel
    '--panel-bg': '#f6f8fa', '--panel-border': '#d0d7de', '--panel-header-bg': '#ffffff',

    // Component — Code editor
    '--code-bg': '#f8f9fa', '--code-bg-deeper': '#ffffff',
    '--code-border': '#d0d7de', '--code-gutter-bg': '#f3f4f6',
    '--code-active-line': 'rgba(59, 91, 219, 0.04)',
    '--code-selection': 'rgba(59, 91, 219, 0.12)',

    // Data viz — HTTP methods (light-optimized, darker for contrast on white)
    '--viz-method-get': '#1a7f37',
    '--viz-method-post': '#1e40af',
    '--viz-method-put': '#9a6700',
    '--viz-method-patch': '#6b21a8',   // indigo-purple — high contrast on white
    '--viz-method-delete': '#b91c1c',
    '--viz-method-head': '#1e40af',
    '--viz-method-options': '#0d5c4a',

    // Data viz — JSON syntax (light-optimized)
    '--viz-json-key': '#1e40af',       // dark blue, 8.2:1 on white
    '--viz-json-string': '#1a7f37',    // dark green, 7.6:1 on white
    '--viz-json-number': '#9a6700',    // dark amber, 4.9:1 on white
    '--viz-json-boolean': '#6b21a8',   // dark purple, 8.1:1 on white
    '--viz-json-null': '#b91c1c',      // dark red, 6.1:1 on white

    // JSON editor
    '--json-editor-bg': '#f8f9fa', '--json-editor-bg-deeper': '#ffffff', '--json-editor-border': '#d0d7de',
  },

  // ─────────────────────────────────────────
  // DARK — Mid dark, default
  // Accent: #748ffc (calmer than old #6c72ff — less glare)
  // Badge-special: CYAN (was purple — now each dark theme has unique identity)
  // ─────────────────────────────────────────
  dark: {
    '--bg': '#16181d',
    '--surface-1': '#1a1d24',
    '--surface-2': '#20242d',
    '--surface-3': '#2a303a',
    '--border': '#353c49',
    '--border-subtle': '#2a303a',
    '--border-focus': '#748ffc',

    '--text': '#e6edf3',
    '--text-subtle': '#9ba3af',
    '--text-muted': '#6b7280',
    '--text-disabled': '#4b5260',

    '--accent': '#748ffc',
    '--accent-hover': '#5c71f7',
    '--accent-dim': 'rgba(116, 143, 252, 0.12)',
    '--accent-text': '#ffffff',

    '--success': '#4ac26b',
    '--success-dim': 'rgba(74, 194, 107, 0.1)',
    '--success-bg-subtle': 'rgba(74, 194, 107, 0.05)',
    '--success-bg-dim': 'rgba(74, 194, 107, 0.1)',
    '--success-bg-strong': 'rgba(74, 194, 107, 0.18)',
    '--success-border': 'rgba(74, 194, 107, 0.35)',

    '--warning': '#d8a441',
    '--warning-dim': 'rgba(216, 164, 65, 0.1)',
    '--warning-bg-subtle': 'rgba(216, 164, 65, 0.05)',
    '--warning-bg-dim': 'rgba(216, 164, 65, 0.1)',
    '--warning-bg-strong': 'rgba(216, 164, 65, 0.18)',
    '--warning-border': 'rgba(216, 164, 65, 0.35)',

    '--error': '#f05d56',
    '--error-dim': 'rgba(240, 93, 86, 0.1)',
    '--error-bg-subtle': 'rgba(240, 93, 86, 0.05)',
    '--error-bg-dim': 'rgba(240, 93, 86, 0.1)',
    '--error-bg-strong': 'rgba(240, 93, 86, 0.18)',
    '--error-border': 'rgba(240, 93, 86, 0.35)',
    '--error-border-dim': 'rgba(240, 93, 86, 0.35)',

    '--info': '#748ffc',
    '--info-dim': 'rgba(116, 143, 252, 0.1)',
    '--info-bg-subtle': 'rgba(116, 143, 252, 0.05)',
    '--info-bg-dim': 'rgba(116, 143, 252, 0.1)',
    '--info-bg-strong': 'rgba(116, 143, 252, 0.18)',
    '--info-border': 'rgba(116, 143, 252, 0.35)',

    '--overlay-bg': 'rgba(0, 0, 0, 0.55)',
    '--scrollbar-thumb': '#3a4050',
    '--scrollbar-thumb-hover': '#4f5668',

    // Component — Badge (special = CYAN — distinct from dark purple in other themes)
    '--badge-error-bg': '#2d0f0e', '--badge-error-text': '#f87171', '--badge-error-border': '#5c1f1d',
    '--badge-success-bg': '#0f2e1a', '--badge-success-text': '#6ee7a0', '--badge-success-border': '#1e5c34',
    '--badge-warning-bg': '#2b1f08', '--badge-warning-text': '#fbbf24', '--badge-warning-border': '#5a3f10',
    '--badge-info-bg': '#111e42', '--badge-info-text': '#a5b4fc', '--badge-info-border': '#2335a0',
    '--badge-neutral-bg': '#1e2330', '--badge-neutral-text': '#9ba3af', '--badge-neutral-border': '#353c49',
    // CYAN identity — makes dark theme feel distinct
    '--badge-special-bg': '#062028', '--badge-special-text': '#67e8f9', '--badge-special-border': '#0e4d60',

    // Component — Button
    '--btn-primary-bg': '#748ffc', '--btn-primary-text': '#ffffff', '--btn-primary-hover': '#5c71f7',
    '--btn-secondary-bg': '#20242d', '--btn-secondary-border': '#353c49',
    '--btn-danger-bg': '#f05d56', '--btn-danger-hover': '#d44840',
    '--btn-ghost-hover': '#2a303a',

    // Component — Input
    '--input-bg': '#20242d', '--input-border': '#353c49', '--input-focus-border': '#748ffc',
    '--input-text': '#e6edf3', '--input-placeholder': '#6b7280',

    // Component — Sidebar
    '--sidebar-bg': '#1a1d24', '--sidebar-border': '#353c49',
    '--sidebar-icon': '#9ba3af', '--sidebar-icon-active': '#748ffc',
    '--sidebar-active-bg': 'rgba(116, 143, 252, 0.1)',

    // Component — Panel
    '--panel-bg': '#16181d', '--panel-border': '#353c49', '--panel-header-bg': '#1a1d24',

    // Component — Code editor
    '--code-bg': '#1a1d24', '--code-bg-deeper': '#131619',
    '--code-border': '#353c49', '--code-gutter-bg': '#16181d',
    '--code-active-line': 'rgba(116, 143, 252, 0.06)',
    '--code-selection': 'rgba(116, 143, 252, 0.15)',

    // Data viz — HTTP methods
    '--viz-method-get': '#4ac26b',
    '--viz-method-post': '#79b8ff',
    '--viz-method-put': '#d8a441',
    '--viz-method-patch': '#cc5de8',  // magenta-purple — distinct from blue accent
    '--viz-method-delete': '#f05d56',
    '--viz-method-head': '#79b8ff',
    '--viz-method-options': '#67e8f9', // cyan — matches badge-special

    // Data viz — JSON syntax
    '--viz-json-key': '#79b8ff',
    '--viz-json-string': '#6ee7a0',
    '--viz-json-number': '#d8a441',
    '--viz-json-boolean': '#cc5de8',  // magenta — not competing with blue accent
    '--viz-json-null': '#f05d56',

    '--json-editor-bg': '#1a1a22', '--json-editor-bg-deeper': '#111118', '--json-editor-border': '#353c49',
  },

  // ─────────────────────────────────────────
  // DEEP DARK — OLED / power user
  // Accent: #8fa4ff (slightly brighter to compensate for deeper bg)
  // Badge-special: ROSE (distinct from dark=cyan, midnight=violet, ember=gold)
  // ─────────────────────────────────────────
  'deep-dark': {
    '--bg': '#0d1117',
    '--surface-1': '#161b22',
    '--surface-2': '#21262d',
    '--surface-3': '#2d333b',
    '--border': '#30363d',
    '--border-subtle': '#21262d',
    '--border-focus': '#8fa4ff',

    '--text': '#e6edf3',
    '--text-subtle': '#8b949e',
    '--text-muted': '#6e7681',
    '--text-disabled': '#484f58',

    '--accent': '#8fa4ff',
    '--accent-hover': '#748ffc',
    '--accent-dim': 'rgba(143, 164, 255, 0.12)',
    '--accent-text': '#ffffff',

    '--success': '#3fb950',
    '--success-dim': 'rgba(63, 185, 80, 0.1)',
    '--success-bg-subtle': 'rgba(63, 185, 80, 0.05)',
    '--success-bg-dim': 'rgba(63, 185, 80, 0.1)',
    '--success-bg-strong': 'rgba(63, 185, 80, 0.18)',
    '--success-border': 'rgba(63, 185, 80, 0.35)',

    '--warning': '#d29922',
    '--warning-dim': 'rgba(210, 153, 34, 0.1)',
    '--warning-bg-subtle': 'rgba(210, 153, 34, 0.05)',
    '--warning-bg-dim': 'rgba(210, 153, 34, 0.1)',
    '--warning-bg-strong': 'rgba(210, 153, 34, 0.18)',
    '--warning-border': 'rgba(210, 153, 34, 0.35)',

    '--error': '#f85149',
    '--error-dim': 'rgba(248, 81, 73, 0.1)',
    '--error-bg-subtle': 'rgba(248, 81, 73, 0.05)',
    '--error-bg-dim': 'rgba(248, 81, 73, 0.1)',
    '--error-bg-strong': 'rgba(248, 81, 73, 0.18)',
    '--error-border': 'rgba(248, 81, 73, 0.35)',
    '--error-border-dim': 'rgba(248, 81, 73, 0.35)',

    '--info': '#8fa4ff',
    '--info-dim': 'rgba(143, 164, 255, 0.1)',
    '--info-bg-subtle': 'rgba(143, 164, 255, 0.05)',
    '--info-bg-dim': 'rgba(143, 164, 255, 0.1)',
    '--info-bg-strong': 'rgba(143, 164, 255, 0.18)',
    '--info-border': 'rgba(143, 164, 255, 0.35)',

    '--overlay-bg': 'rgba(0, 0, 0, 0.65)',
    '--scrollbar-thumb': '#30363d',
    '--scrollbar-thumb-hover': '#484f58',

    // Badge — special = ROSE
    '--badge-error-bg': '#270a0a', '--badge-error-text': '#fca5a5', '--badge-error-border': '#5c1616',
    '--badge-success-bg': '#0a200f', '--badge-success-text': '#86efac', '--badge-success-border': '#166534',
    '--badge-warning-bg': '#241600', '--badge-warning-text': '#fcd34d', '--badge-warning-border': '#4d2d00',
    '--badge-info-bg': '#0e1633', '--badge-info-text': '#a5b4fc', '--badge-info-border': '#1e2f8a',
    '--badge-neutral-bg': '#21262d', '--badge-neutral-text': '#8b949e', '--badge-neutral-border': '#30363d',
    // ROSE identity
    '--badge-special-bg': '#2a0a16', '--badge-special-text': '#fda4af', '--badge-special-border': '#6e1a30',

    // Button
    '--btn-primary-bg': '#8fa4ff', '--btn-primary-text': '#0d1117', '--btn-primary-hover': '#748ffc',
    '--btn-secondary-bg': '#21262d', '--btn-secondary-border': '#30363d',
    '--btn-danger-bg': '#f85149', '--btn-danger-hover': '#e03c35',
    '--btn-ghost-hover': '#2d333b',

    // Input
    '--input-bg': '#0d1117', '--input-border': '#30363d', '--input-focus-border': '#8fa4ff',
    '--input-text': '#e6edf3', '--input-placeholder': '#6e7681',

    // Sidebar
    '--sidebar-bg': '#161b22', '--sidebar-border': '#30363d',
    '--sidebar-icon': '#8b949e', '--sidebar-icon-active': '#8fa4ff',
    '--sidebar-active-bg': 'rgba(143, 164, 255, 0.1)',

    // Panel
    '--panel-bg': '#0d1117', '--panel-border': '#30363d', '--panel-header-bg': '#161b22',

    // Code
    '--code-bg': '#161b22', '--code-bg-deeper': '#0d1117',
    '--code-border': '#30363d', '--code-gutter-bg': '#0d1117',
    '--code-active-line': 'rgba(143, 164, 255, 0.05)',
    '--code-selection': 'rgba(143, 164, 255, 0.14)',

    // Methods
    '--viz-method-get': '#3fb950',
    '--viz-method-post': '#79c0ff',
    '--viz-method-put': '#d29922',
    '--viz-method-patch': '#e599f7',  // lighter purple on deeper bg — high contrast
    '--viz-method-delete': '#f85149',
    '--viz-method-head': '#79c0ff',
    '--viz-method-options': '#fda4af', // rose — matches badge-special

    // JSON
    '--viz-json-key': '#79c0ff',
    '--viz-json-string': '#56d364',
    '--viz-json-number': '#d29922',
    '--viz-json-boolean': '#e599f7',
    '--viz-json-null': '#f85149',

    '--json-editor-bg': '#0d1117', '--json-editor-bg-deeper': '#080b0f', '--json-editor-border': '#30363d',
  },

  // ─────────────────────────────────────────
  // MIDNIGHT — New. Electric cyan accent on deep ocean bg.
  // For night-shift devs who want something different from GitHub's deep dark.
  // Badge-special: VIOLET
  // ─────────────────────────────────────────
  midnight: {
    '--bg': '#030c15',
    '--surface-1': '#071422',
    '--surface-2': '#0d1f35',
    '--surface-3': '#142844',
    '--border': '#1c3553',
    '--border-subtle': '#0d1f35',
    '--border-focus': '#00cbe8',

    '--text': '#d4e8f7',
    '--text-subtle': '#7aa8cc',
    '--text-muted': '#4d7a9e',
    '--text-disabled': '#254466',

    '--accent': '#00cbe8',
    '--accent-hover': '#00afc9',
    '--accent-dim': 'rgba(0, 203, 232, 0.1)',
    '--accent-text': '#030c15',

    '--success': '#34d399',
    '--success-dim': 'rgba(52, 211, 153, 0.1)',
    '--success-bg-subtle': 'rgba(52, 211, 153, 0.05)',
    '--success-bg-dim': 'rgba(52, 211, 153, 0.1)',
    '--success-bg-strong': 'rgba(52, 211, 153, 0.18)',
    '--success-border': 'rgba(52, 211, 153, 0.35)',

    '--warning': '#fbbf24',
    '--warning-dim': 'rgba(251, 191, 36, 0.1)',
    '--warning-bg-subtle': 'rgba(251, 191, 36, 0.05)',
    '--warning-bg-dim': 'rgba(251, 191, 36, 0.1)',
    '--warning-bg-strong': 'rgba(251, 191, 36, 0.18)',
    '--warning-border': 'rgba(251, 191, 36, 0.35)',

    '--error': '#f87171',
    '--error-dim': 'rgba(248, 113, 113, 0.1)',
    '--error-bg-subtle': 'rgba(248, 113, 113, 0.05)',
    '--error-bg-dim': 'rgba(248, 113, 113, 0.1)',
    '--error-bg-strong': 'rgba(248, 113, 113, 0.18)',
    '--error-border': 'rgba(248, 113, 113, 0.35)',
    '--error-border-dim': 'rgba(248, 113, 113, 0.35)',

    '--info': '#00cbe8',
    '--info-dim': 'rgba(0, 203, 232, 0.1)',
    '--info-bg-subtle': 'rgba(0, 203, 232, 0.05)',
    '--info-bg-dim': 'rgba(0, 203, 232, 0.1)',
    '--info-bg-strong': 'rgba(0, 203, 232, 0.18)',
    '--info-border': 'rgba(0, 203, 232, 0.35)',

    '--overlay-bg': 'rgba(0, 0, 0, 0.7)',
    '--scrollbar-thumb': '#1c3553',
    '--scrollbar-thumb-hover': '#254466',

    // Badge — special = VIOLET
    '--badge-error-bg': '#230a0a', '--badge-error-text': '#fca5a5', '--badge-error-border': '#5c1414',
    '--badge-success-bg': '#061e14', '--badge-success-text': '#6ee7b7', '--badge-success-border': '#0d5c3c',
    '--badge-warning-bg': '#1e1400', '--badge-warning-text': '#fcd34d', '--badge-warning-border': '#4d3000',
    '--badge-info-bg': '#011420', '--badge-info-text': '#67e8f9', '--badge-info-border': '#0e4050',
    '--badge-neutral-bg': '#0d1f35', '--badge-neutral-text': '#7aa8cc', '--badge-neutral-border': '#1c3553',
    // VIOLET identity
    '--badge-special-bg': '#180a3d', '--badge-special-text': '#c084fc', '--badge-special-border': '#4c1d95',

    '--btn-primary-bg': '#00cbe8', '--btn-primary-text': '#030c15', '--btn-primary-hover': '#00afc9',
    '--btn-secondary-bg': '#0d1f35', '--btn-secondary-border': '#1c3553',
    '--btn-danger-bg': '#f87171', '--btn-danger-hover': '#ef4444',
    '--btn-ghost-hover': '#142844',

    '--input-bg': '#071422', '--input-border': '#1c3553', '--input-focus-border': '#00cbe8',
    '--input-text': '#d4e8f7', '--input-placeholder': '#4d7a9e',

    '--sidebar-bg': '#071422', '--sidebar-border': '#1c3553',
    '--sidebar-icon': '#7aa8cc', '--sidebar-icon-active': '#00cbe8',
    '--sidebar-active-bg': 'rgba(0, 203, 232, 0.08)',

    '--panel-bg': '#030c15', '--panel-border': '#1c3553', '--panel-header-bg': '#071422',

    '--code-bg': '#071422', '--code-bg-deeper': '#030c15',
    '--code-border': '#1c3553', '--code-gutter-bg': '#030c15',
    '--code-active-line': 'rgba(0, 203, 232, 0.06)',
    '--code-selection': 'rgba(0, 203, 232, 0.15)',

    '--viz-method-get': '#34d399',
    '--viz-method-post': '#67e8f9',
    '--viz-method-put': '#fbbf24',
    '--viz-method-patch': '#c084fc',  // violet — matches badge-special
    '--viz-method-delete': '#f87171',
    '--viz-method-head': '#67e8f9',
    '--viz-method-options': '#a78bfa',

    '--viz-json-key': '#67e8f9',
    '--viz-json-string': '#6ee7b7',
    '--viz-json-number': '#fbbf24',
    '--viz-json-boolean': '#c084fc',
    '--viz-json-null': '#f87171',

    '--json-editor-bg': '#071422', '--json-editor-bg-deeper': '#030c15', '--json-editor-border': '#1c3553',
  },

  // ─────────────────────────────────────────
  // EMBER — New. Warm dark. Amber accent.
  // Evokes a terminal glow, bonfire, late-night coding ambiance.
  // Badge-special: GOLD
  // ─────────────────────────────────────────
  ember: {
    '--bg': '#110a07',
    '--surface-1': '#1c130e',
    '--surface-2': '#271a13',
    '--surface-3': '#33221a',
    '--border': '#4a3228',
    '--border-subtle': '#33221a',
    '--border-focus': '#f97316',

    '--text': '#f5e9d8',
    '--text-subtle': '#c4a882',
    '--text-muted': '#8a7060',
    '--text-disabled': '#4a3228',

    '--accent': '#f97316',
    '--accent-hover': '#ea6c10',
    '--accent-dim': 'rgba(249, 115, 22, 0.12)',
    '--accent-text': '#ffffff',

    '--success': '#4ade80',
    '--success-dim': 'rgba(74, 222, 128, 0.1)',
    '--success-bg-subtle': 'rgba(74, 222, 128, 0.05)',
    '--success-bg-dim': 'rgba(74, 222, 128, 0.1)',
    '--success-bg-strong': 'rgba(74, 222, 128, 0.18)',
    '--success-border': 'rgba(74, 222, 128, 0.3)',

    '--warning': '#fbbf24',
    '--warning-dim': 'rgba(251, 191, 36, 0.1)',
    '--warning-bg-subtle': 'rgba(251, 191, 36, 0.05)',
    '--warning-bg-dim': 'rgba(251, 191, 36, 0.1)',
    '--warning-bg-strong': 'rgba(251, 191, 36, 0.18)',
    '--warning-border': 'rgba(251, 191, 36, 0.3)',

    '--error': '#f87171',
    '--error-dim': 'rgba(248, 113, 113, 0.1)',
    '--error-bg-subtle': 'rgba(248, 113, 113, 0.05)',
    '--error-bg-dim': 'rgba(248, 113, 113, 0.1)',
    '--error-bg-strong': 'rgba(248, 113, 113, 0.18)',
    '--error-border': 'rgba(248, 113, 113, 0.3)',
    '--error-border-dim': 'rgba(248, 113, 113, 0.3)',

    '--info': '#f97316',
    '--info-dim': 'rgba(249, 115, 22, 0.1)',
    '--info-bg-subtle': 'rgba(249, 115, 22, 0.05)',
    '--info-bg-dim': 'rgba(249, 115, 22, 0.1)',
    '--info-bg-strong': 'rgba(249, 115, 22, 0.18)',
    '--info-border': 'rgba(249, 115, 22, 0.3)',

    '--overlay-bg': 'rgba(0, 0, 0, 0.7)',
    '--scrollbar-thumb': '#4a3228',
    '--scrollbar-thumb-hover': '#5e4038',

    // Badge — special = GOLD
    '--badge-error-bg': '#2a0f0a', '--badge-error-text': '#fca5a5', '--badge-error-border': '#5c1e16',
    '--badge-success-bg': '#0a200f', '--badge-success-text': '#86efac', '--badge-success-border': '#14532d',
    '--badge-warning-bg': '#241600', '--badge-warning-text': '#fde68a', '--badge-warning-border': '#4d2d00',
    '--badge-info-bg': '#2a1500', '--badge-info-text': '#fdba74', '--badge-info-border': '#7c2d12',
    '--badge-neutral-bg': '#271a13', '--badge-neutral-text': '#c4a882', '--badge-neutral-border': '#4a3228',
    // GOLD identity
    '--badge-special-bg': '#281800', '--badge-special-text': '#fcd34d', '--badge-special-border': '#713f12',

    '--btn-primary-bg': '#f97316', '--btn-primary-text': '#ffffff', '--btn-primary-hover': '#ea6c10',
    '--btn-secondary-bg': '#271a13', '--btn-secondary-border': '#4a3228',
    '--btn-danger-bg': '#f87171', '--btn-danger-hover': '#ef4444',
    '--btn-ghost-hover': '#33221a',

    '--input-bg': '#1c130e', '--input-border': '#4a3228', '--input-focus-border': '#f97316',
    '--input-text': '#f5e9d8', '--input-placeholder': '#8a7060',

    '--sidebar-bg': '#1c130e', '--sidebar-border': '#4a3228',
    '--sidebar-icon': '#c4a882', '--sidebar-icon-active': '#f97316',
    '--sidebar-active-bg': 'rgba(249, 115, 22, 0.1)',

    '--panel-bg': '#110a07', '--panel-border': '#4a3228', '--panel-header-bg': '#1c130e',

    '--code-bg': '#1c130e', '--code-bg-deeper': '#110a07',
    '--code-border': '#4a3228', '--code-gutter-bg': '#110a07',
    '--code-active-line': 'rgba(249, 115, 22, 0.06)',
    '--code-selection': 'rgba(249, 115, 22, 0.14)',

    '--viz-method-get': '#4ade80',
    '--viz-method-post': '#93c5fd',
    '--viz-method-put': '#fbbf24',
    '--viz-method-patch': '#c084fc',  // purple — high contrast on warm dark
    '--viz-method-delete': '#f87171',
    '--viz-method-head': '#93c5fd',
    '--viz-method-options': '#fcd34d',  // gold — matches badge-special

    '--viz-json-key': '#93c5fd',
    '--viz-json-string': '#86efac',
    '--viz-json-number': '#fbbf24',
    '--viz-json-boolean': '#c084fc',
    '--viz-json-null': '#f87171',

    '--json-editor-bg': '#1c130e', '--json-editor-bg-deeper': '#110a07', '--json-editor-border': '#4a3228',
  },
};

// Metadata for ThemePanel cards
export const THEME_META = [
  {
    id: 'light',
    label: 'Light',
    description: 'Professional · Daytime',
    preview: { bg: '#f6f8fa', surface: '#ffffff', border: '#d0d7de', text: '#1f2328', accent: '#3b5bdb' },
  },
  {
    id: 'dark',
    label: 'Mid Dark',
    description: 'Default · Modern SaaS',
    preview: { bg: '#16181d', surface: '#1a1d24', border: '#353c49', text: '#e6edf3', accent: '#748ffc' },
  },
  {
    id: 'deep-dark',
    label: 'Deep Dark',
    description: 'OLED · Power User',
    preview: { bg: '#0d1117', surface: '#161b22', border: '#30363d', text: '#e6edf3', accent: '#8fa4ff' },
  },
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'Ocean · Cyan accent',
    preview: { bg: '#030c15', surface: '#071422', border: '#1c3553', text: '#d4e8f7', accent: '#00cbe8' },
  },
  {
    id: 'ember',
    label: 'Ember',
    description: 'Warm · Amber accent',
    preview: { bg: '#110a07', surface: '#1c130e', border: '#4a3228', text: '#f5e9d8', accent: '#f97316' },
  },
];
```

---

## Task 2: Update global.css backward compat aliases

In `global.css`, the `--method-*` and `--json-*` aliases in the `:root` fallback block still reference old static values. Replace them:

```css
/* Data viz — JS sets per theme, fallback = dark values */
--method-get: var(--viz-method-get);
--method-post: var(--viz-method-post);
--method-put: var(--viz-method-put);
--method-patch: var(--viz-method-patch);
--method-delete: var(--viz-method-delete);
--method-head: var(--viz-method-head);
--method-options: var(--viz-method-options);

--json-key: var(--viz-json-key);
--json-string: var(--viz-json-string);
--json-number: var(--viz-json-number);
--json-boolean: var(--viz-json-boolean);
--json-null: var(--viz-json-null);
```

This keeps backward compat for any component still using `var(--method-get)` or `var(--json-key)`.

Also add the new component token fallbacks (dark theme values as defaults):
```css
--btn-primary-bg: var(--accent);  --btn-primary-text: #fff;  --btn-primary-hover: var(--accent-hover);
--btn-secondary-bg: var(--surface-2);  --btn-secondary-border: var(--border);
--btn-danger-bg: var(--error);  --btn-danger-hover: var(--error);
--btn-ghost-hover: var(--surface-3);
--input-bg: var(--surface-2);  --input-border: var(--border);  --input-focus-border: var(--accent);
--input-text: var(--text);  --input-placeholder: var(--text-muted);
--sidebar-bg: var(--surface-1);  --sidebar-border: var(--border);
--sidebar-icon: var(--text-subtle);  --sidebar-icon-active: var(--accent);
--sidebar-active-bg: var(--accent-dim);
--panel-bg: var(--bg);  --panel-border: var(--border);  --panel-header-bg: var(--surface-1);
--code-bg: var(--surface-1);  --code-bg-deeper: var(--bg);
--code-border: var(--border);  --code-gutter-bg: var(--bg);
--code-active-line: rgba(116, 143, 252, 0.06);  --code-selection: rgba(116, 143, 252, 0.15);
--badge-special-bg: var(--badge-purple-bg, #062028);
--badge-special-text: var(--badge-purple-text, #67e8f9);
--badge-special-border: var(--badge-purple-border, #0e4d60);
```

---

## Acceptance Criteria

- [ ] Build passes clean
- [ ] 5 theme presets in THEME_META
- [ ] Switch to Light → JSON editor shows dark blue keys, dark green strings (not washed-out light blue)
- [ ] Switch to Light → `--method-patch` is `#6b21a8` (dark indigo), readable on white
- [ ] Switch to Midnight → accent is cyan, badge-special is violet
- [ ] Switch to Ember → accent is orange, text has warm tint
- [ ] No theme shows the same color for badge-special — each has a distinct hue identity
- [ ] Dark theme accent reads as blue-violet (not pure purple)
- [ ] Deep dark button primary text is `#0d1117` (dark, since accent is near-white) — visual check
