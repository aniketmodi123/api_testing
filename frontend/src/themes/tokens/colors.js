// All color token names used across the app.
// Values are NOT defined here — presets/themes.js owns the values per theme.
// This file documents what every color token means (the registry).

export const COLOR_TOKEN_KEYS = [
  // --- Tier 2: semantic surfaces / lines / text ---
  '--bg',
  '--surface-1',
  '--surface-2',
  '--surface-3',
  '--border',
  '--border-subtle',
  '--border-strong',

  '--text',
  '--text-subtle',
  '--text-muted',

  '--accent',
  '--accent-hover',
  '--accent-dim',
  '--accent-text',

  '--success',
  '--success-dim',
  '--warning',
  '--warning-dim',
  '--error',
  '--error-dim',
  '--info',
  '--info-dim',

  '--scrollbar-thumb',
  '--scrollbar-thumb-hover',

  // Semantic overlay / status-fill vars
  '--overlay-bg',
  '--error-bg-subtle',
  '--error-bg-dim',
  '--error-bg-strong',
  '--error-border-dim',
  '--success-bg-dim',
  '--success-bg-strong',
  '--success-border-dim',
  '--warning-bg-dim',

  // Badge semantic tokens
  '--badge-error-bg',
  '--badge-error-text',
  '--badge-error-border',
  '--badge-info-bg',
  '--badge-info-text',
  '--badge-info-border',
  '--badge-success-bg',
  '--badge-success-text',
  '--badge-success-border',
  '--badge-special-bg',
  '--badge-special-text',
  '--badge-special-border',

  // JsonEditor theme-specific surfaces
  '--json-editor-bg',
  '--json-editor-bg-deeper',
  '--json-editor-border',

  // --- Tier 3: component tokens (default to Tier 2 via var() in themes.js) ---
  // Button
  '--btn-primary-bg', '--btn-primary-text', '--btn-primary-hover',
  '--btn-secondary-bg', '--btn-secondary-border',
  '--btn-danger-bg', '--btn-danger-hover',
  '--btn-ghost-hover',

  // Input
  '--input-bg', '--input-border', '--input-focus-border',
  '--input-text', '--input-placeholder',

  // Sidebar
  '--sidebar-bg', '--sidebar-border', '--sidebar-icon',
  '--sidebar-icon-active', '--sidebar-active-bg',

  // Panel
  '--panel-bg', '--panel-border', '--panel-header-bg',

  // Code editor (surfaces; syntax colors come from EDITOR_PRESETS)
  '--code-bg', '--code-bg-deeper', '--code-border', '--code-gutter-bg',
  '--code-active-line', '--code-selection',

  // Data viz — HTTP methods (now themed, not static)
  '--viz-method-get', '--viz-method-post', '--viz-method-put',
  '--viz-method-patch', '--viz-method-delete', '--viz-method-head', '--viz-method-options',

  // Data viz — JSON syntax (now themed via EDITOR_PRESETS, theme provides fallback)
  '--viz-json-key', '--viz-json-string', '--viz-json-number',
  '--viz-json-boolean', '--viz-json-null',
];

// Tokens that never change across any preset.
// HTTP method + JSON syntax colors are NO LONGER static — they are themed
// (per color theme + overridden by the active editor/syntax theme).
export const STATIC_COLOR_TOKENS = {};
