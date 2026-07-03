import { isHex, accentComponentTokens, buildAccentOverride } from './customTheme.js';
import { STATIC_COLOR_TOKENS } from './tokens/colors.js';
import { STATIC_TYPOGRAPHY_TOKENS } from './tokens/typography.js';
import { THEME_PRESETS } from './presets/themes.js';
import { FONT_PRESETS } from './presets/fonts.js';
import { ACCENT_PRESETS } from './presets/accents.js';
import { CODE_FONT_PRESETS } from './presets/codeFonts.js';
import { SPACING_PRESETS } from './presets/spacing.js';
import { RADIUS_PRESETS } from './presets/radius.js';
import { SHADOW_PRESETS } from './presets/shadow.js';
import { MOTION_PRESETS } from './presets/motion.js';
import { EDITOR_PRESETS } from './presets/editorThemes.js';
import { A11Y_PRESETS } from './presets/a11y.js';

export const DEFAULT_PREFERENCES = {
  theme: 'carbon',
  accent: 'default',
  font: 'inter',
  codeFont: 'jetbrains',
  spacing: 'default',
  radius: 'modern',
  shadow: 'flat',
  motion: 'balanced',
  editor: 'tokyonight',
  a11y: 'standard',
  customAccent: null, // a custom accent hex (#rrggbb); wins over the accent preset when set
  customTheme: null, // name of an active custom theme, if any
};

const STORAGE_KEY = 'apipilot-preferences';

function loadPreferences() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) } : { ...DEFAULT_PREFERENCES };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

function savePreferences(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage unavailable — silent fail, app still works
  }
}

// Build the flat token map for a set of preferences.
// Merge order — later wins: static → typography → color → accent override →
// font → codeFont → spacing → radius → shadow → motion → editor → a11y.
// `customOverrides` (an active custom theme's token_map) wins over everything.
function resolveTokens(prefs, customOverrides) {
  // Accent layer: a preset's tuned tokens (extended so the accent also cascades to the
  // primary button / focus ring / sidebar), or a full override built from a custom hex.
  // A custom accent always wins over the preset.
  const accentPreset = ACCENT_PRESETS[prefs.accent];
  let accentOverride = {};
  if (accentPreset && accentPreset.value) {
    const v = accentPreset.value;
    accentOverride = { ...v, ...accentComponentTokens(v['--accent'], v['--accent-hover'], v['--accent-dim']) };
  }
  if (prefs.customAccent && isHex(prefs.customAccent)) {
    accentOverride = buildAccentOverride(prefs.customAccent);
  }

  return {
    ...STATIC_COLOR_TOKENS,
    ...STATIC_TYPOGRAPHY_TOKENS,
    ...(THEME_PRESETS[prefs.theme] ?? THEME_PRESETS.carbon),
    ...accentOverride,
    ...(FONT_PRESETS[prefs.font] ?? FONT_PRESETS.inter),
    ...(CODE_FONT_PRESETS[prefs.codeFont] ?? CODE_FONT_PRESETS.jetbrains),
    ...(SPACING_PRESETS[prefs.spacing] ?? SPACING_PRESETS.default),
    ...(RADIUS_PRESETS[prefs.radius] ?? RADIUS_PRESETS.modern),
    ...(SHADOW_PRESETS[prefs.shadow] ?? SHADOW_PRESETS.flat),
    ...(MOTION_PRESETS[prefs.motion] ?? MOTION_PRESETS.balanced),
    ...(EDITOR_PRESETS[prefs.editor] ?? EDITOR_PRESETS.tokyonight),
    ...(A11Y_PRESETS[prefs.a11y] ?? A11Y_PRESETS.standard),
    ...(customOverrides ?? {}),
  };
}

// Main engine. Resolves all token layers and injects them onto :root.
// To add a new category: add its preset to resolveTokens() above.
export function applyPreset(preferences, customOverrides = null) {
  const prefs = { ...DEFAULT_PREFERENCES, ...preferences };
  const merged = resolveTokens(prefs, customOverrides);

  const root = document.documentElement;
  for (const [key, value] of Object.entries(merged)) {
    root.style.setProperty(key, value);
  }

  // data-* attributes for any CSS-only selectors that need them
  root.setAttribute('data-theme', prefs.theme);
  root.setAttribute('data-font', prefs.font);
  root.setAttribute('data-spacing', prefs.spacing);
  root.setAttribute('data-radius', prefs.radius);
  root.setAttribute('data-shadow', prefs.shadow);
  root.setAttribute('data-motion', prefs.motion);
  root.setAttribute('data-editor', prefs.editor);
  root.setAttribute('data-a11y', prefs.a11y);

  savePreferences(prefs);
  return prefs;
}

// Apply tokens scoped to a single element (used for live preview in ThemePanel).
// Does NOT touch :root or localStorage.
export function applyPresetToElement(element, preferences, customOverrides = null) {
  const prefs = { ...DEFAULT_PREFERENCES, ...preferences };
  const merged = resolveTokens(prefs, customOverrides);
  for (const [key, value] of Object.entries(merged)) {
    element.style.setProperty(key, value);
  }
}

export { loadPreferences, resolveTokens, THEME_PRESETS, FONT_PRESETS };
export { THEME_META, LIGHT_THEME_IDS } from './presets/themes.js';
export { FONT_META } from './presets/fonts.js';
export { ACCENT_META } from './presets/accents.js';
export { CODE_FONT_META } from './presets/codeFonts.js';
export { SPACING_META } from './presets/spacing.js';
export { RADIUS_META } from './presets/radius.js';
export { SHADOW_META } from './presets/shadow.js';
export { MOTION_META } from './presets/motion.js';
export { EDITOR_META } from './presets/editorThemes.js';
export { A11Y_META } from './presets/a11y.js';
