// Shared, pure helpers for the custom theme editor (Phase E) — reused as-is by
// Theme Builder (Phase F) and Marketplace (Phase G). No React, no DOM access except
// the Blob/anchor download in exportThemeJson.

// WCAG relative luminance — parses #rrggbb, converts sRGB channels to linear light,
// then weights them per the WCAG 2.x formula.
export function relativeLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

// WCAG contrast ratio between two hex colors, e.g. "4.5" for text vs background.
export function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return ((lighter + 0.05) / (darker + 0.05)).toFixed(1);
}

// Strict 6-digit hex check — anything else (rgba(), short hex, empty string) fails so
// callers can skip contrast math and color-picker binding on non-hex token values.
export const isHex = (v) => /^#[0-9a-fA-F]{6}$/.test(v);

// Convert a hex color to an rgba(...) string at the given alpha — used for dim/subtle
// token variants derived from a single accent color.
export function hexToDim(hex, alpha = 0.1) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Given a new --accent value, return the dependent token overrides that should change
// alongside it (button, focus ring, input focus, active sidebar icon, dim background).
export function deriveAccent(hex) {
  return {
    '--btn-primary-bg': hex,
    '--border-focus': hex,
    '--input-focus-border': hex,
    '--sidebar-icon-active': hex,
    '--accent-dim': hexToDim(hex, 0.12),
  };
}

const CUSTOM_THEMES_KEY = 'polaris-custom-themes';

// Read the saved custom-theme list (fallback store; Phase H moves this to the backend).
// Returns [] when storage is empty, unavailable, or holds malformed JSON.
export function loadCustomThemes() {
  try {
    const stored = localStorage.getItem(CUSTOM_THEMES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Persist the full custom-theme list. Silently no-ops when storage is unavailable
// (e.g. private browsing) — the app keeps working with the in-memory state.
export function saveCustomThemes(list) {
  try {
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(list));
  } catch {
    // localStorage unavailable — silent fail, in-memory state still works this session
  }
}

// Trigger a browser download of a theme's token map as formatted JSON.
export function exportThemeJson(name, tokenMap) {
  const json = JSON.stringify({ name, token_map: tokenMap }, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `polaris-theme-${name.toLowerCase().trim().replace(/\s+/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
