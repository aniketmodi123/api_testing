// Color presets — 12 curated themes (3 light, 9 dark).
// Each theme is a full Tier-1/2/3 token set. To keep 12 themes maintainable and avoid
// ~1100 lines of repetitive hand-tuned objects, themes are declared as compact specs
// (core palette only) and expanded by buildTheme(): the repetitive rgba status variants,
// badge colors, and component tokens are derived from the core palette. The exported
// THEME_PRESETS / THEME_META shapes are identical to the old hand-written ones — the
// engine (themes/index.js) and ThemePanel consume them unchanged.

// --- color helpers -------------------------------------------------------

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const int = parseInt(full, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

// rgba() string from a hex + alpha — used for status tints and accent overlays.
function rgba(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// color-mix() string — blend `pct`% of `hex` into `other` (a color or transparent).
function mix(hex, pct, other) {
  return `color-mix(in srgb, ${hex} ${pct}%, ${other})`;
}

// Status color → its 5 tint variants (dim / bg-subtle / bg-dim / bg-strong / border).
// Light themes use slightly stronger fills + lighter borders than dark themes.
function statusVariants(prefix, hex, isLight) {
  const strong = isLight ? 0.15 : 0.18;
  const border = isLight ? 0.3 : 0.35;
  return {
    [`${prefix}`]: hex,
    [`${prefix}-dim`]: rgba(hex, 0.1),
    [`${prefix}-bg-subtle`]: rgba(hex, 0.05),
    [`${prefix}-bg-dim`]: rgba(hex, 0.1),
    [`${prefix}-bg-strong`]: rgba(hex, strong),
    [`${prefix}-border`]: rgba(hex, border),
  };
}

// A badge's bg / text / border derived from one hue. Dark themes brighten the text;
// light themes darken it. bg is the hue blended into the surface; border is translucent.
function badge(hue, isLight, surface) {
  return {
    bg: isLight ? mix(hue, 9, '#ffffff') : mix(hue, 16, surface),
    text: isLight ? mix(hue, 78, '#000000') : mix(hue, 80, '#ffffff'),
    border: mix(hue, isLight ? 30 : 40, 'transparent'),
  };
}

// Expand a compact theme spec into the full flat token map.
function buildTheme(s) {
  const L = s.isLight;
  const b = {
    error: badge(s.error, L, s.s1),
    success: badge(s.success, L, s.s1),
    warning: badge(s.warning, L, s.s1),
    info: badge(s.info, L, s.s1),
    neutral: badge(s.textSubtle, L, s.s1),
    special: badge(s.special, L, s.s1),
  };

  return {
    // Surfaces & borders
    '--bg': s.bg,
    '--surface-1': s.s1,
    '--surface-2': s.s2,
    '--surface-3': s.s3,
    '--border': s.border,
    '--border-subtle': s.borderSubtle,
    '--border-strong': s.borderStrong,
    '--border-focus': s.accent,

    // Text
    '--text': s.text,
    '--text-subtle': s.textSubtle,
    '--text-muted': s.textMuted,
    '--text-disabled': s.textDisabled,

    // Accent
    '--accent': s.accent,
    '--accent-hover': s.accentHover,
    '--accent-dim': rgba(s.accent, L ? 0.1 : 0.12),
    '--accent-text': s.accentText,

    // Status + variants
    ...statusVariants('--success', s.success, L),
    '--success-border-dim': rgba(s.success, L ? 0.3 : 0.35),
    ...statusVariants('--warning', s.warning, L),
    ...statusVariants('--error', s.error, L),
    '--error-border-dim': rgba(s.error, L ? 0.3 : 0.35),
    ...statusVariants('--info', s.info, L),

    // Utility
    '--overlay-bg': s.overlay,
    '--scrollbar-thumb': s.scrollbar,
    '--scrollbar-thumb-hover': s.scrollbarHover,

    // Component — Badge
    '--badge-error-bg': b.error.bg, '--badge-error-text': b.error.text, '--badge-error-border': b.error.border,
    '--badge-success-bg': b.success.bg, '--badge-success-text': b.success.text, '--badge-success-border': b.success.border,
    '--badge-warning-bg': b.warning.bg, '--badge-warning-text': b.warning.text, '--badge-warning-border': b.warning.border,
    '--badge-info-bg': b.info.bg, '--badge-info-text': b.info.text, '--badge-info-border': b.info.border,
    '--badge-neutral-bg': b.neutral.bg, '--badge-neutral-text': b.neutral.text, '--badge-neutral-border': b.neutral.border,
    '--badge-special-bg': b.special.bg, '--badge-special-text': b.special.text, '--badge-special-border': b.special.border,

    // Component — Button
    '--btn-primary-bg': s.accent, '--btn-primary-text': s.accentText, '--btn-primary-hover': s.accentHover,
    '--btn-secondary-bg': s.s2, '--btn-secondary-border': s.border,
    '--btn-danger-bg': s.error, '--btn-danger-hover': mix(s.error, 82, '#000000'),
    '--btn-ghost-hover': s.s3,

    // Component — Input
    '--input-bg': L ? s.s1 : s.s2, '--input-border': s.border, '--input-focus-border': s.accent,
    '--input-text': s.text, '--input-placeholder': s.textMuted,

    // Component — Sidebar
    '--sidebar-bg': s.s1, '--sidebar-border': s.border,
    '--sidebar-icon': s.textSubtle, '--sidebar-icon-active': s.accent,
    '--sidebar-active-bg': rgba(s.accent, L ? 0.08 : 0.1),

    // Component — Panel
    '--panel-bg': s.bg, '--panel-border': s.border, '--panel-header-bg': s.s1,

    // Component — Code editor
    '--code-bg': s.s1, '--code-bg-deeper': s.bg,
    '--code-border': s.border, '--code-gutter-bg': s.bg,
    '--code-active-line': rgba(s.accent, 0.06),
    '--code-selection': rgba(s.accent, 0.15),

    // Data viz — HTTP methods (derived: distinct hue per method)
    '--viz-method-get': s.success,
    '--viz-method-post': s.info,
    '--viz-method-put': s.warning,
    '--viz-method-patch': s.special,
    '--viz-method-delete': s.error,
    '--viz-method-head': s.info,
    '--viz-method-options': s.special,

    // Data viz — JSON syntax (derived)
    '--viz-json-key': s.info,
    '--viz-json-string': s.success,
    '--viz-json-number': s.warning,
    '--viz-json-boolean': s.special,
    '--viz-json-null': s.error,

    '--json-editor-bg': s.s1, '--json-editor-bg-deeper': s.bg, '--json-editor-border': s.border,
  };
}

// --- theme specs ---------------------------------------------------------
// Order: 3 light, then 9 dark.

const SPECS = [
  // ── LIGHT ──────────────────────────────────────────────
  {
    id: 'snow', label: 'Snow White', description: 'GitHub · Pure productivity', isLight: true,
    bg: '#ffffff', s1: '#ffffff', s2: '#f6f8fa', s3: '#eaeef2',
    border: '#d0d7de', borderSubtle: '#eaeef2', borderStrong: '#afb8c1',
    text: '#1f2328', textSubtle: '#59636e', textMuted: '#818b98', textDisabled: '#afb8c1',
    accent: '#0969da', accentHover: '#0860ca', accentText: '#ffffff',
    success: '#1a7f37', warning: '#9a6700', error: '#cf222e', info: '#0969da', special: '#1f883d',
    scrollbar: '#c8d1da', scrollbarHover: '#a8b3bf', overlay: 'rgba(0, 0, 0, 0.4)',
  },
  {
    id: 'paper', label: 'Warm Paper', description: 'Notion · Reading focused', isLight: true,
    bg: '#faf8f5', s1: '#fffefb', s2: '#f3efe9', s3: '#e9e3d9',
    border: '#e0d8cc', borderSubtle: '#ece6dc', borderStrong: '#c4b8a6',
    text: '#37352f', textSubtle: '#6b6760', textMuted: '#918c82', textDisabled: '#bdb6a8',
    accent: '#b45309', accentHover: '#92400e', accentText: '#ffffff',
    success: '#4d7c0f', warning: '#b45309', error: '#b91c1c', info: '#1d4ed8', special: '#0f766e',
    scrollbar: '#d8cfc0', scrollbarHover: '#bdb09a', overlay: 'rgba(40, 30, 15, 0.4)',
  },
  {
    id: 'enterprise', label: 'Modern Enterprise', description: 'SaaS · Blue-gray surfaces', isLight: true,
    bg: '#eef1f5', s1: '#ffffff', s2: '#f4f6f9', s3: '#e6eaf0',
    border: '#d3dae3', borderSubtle: '#e6eaf0', borderStrong: '#adb8c6',
    text: '#1a2233', textSubtle: '#4a5568', textMuted: '#718096', textDisabled: '#a0aec0',
    accent: '#2563eb', accentHover: '#1d4ed8', accentText: '#ffffff',
    success: '#059669', warning: '#d97706', error: '#dc2626', info: '#2563eb', special: '#0891b2',
    scrollbar: '#c3ccd9', scrollbarHover: '#a3afc2', overlay: 'rgba(15, 23, 42, 0.45)',
  },

  // ── DARK ───────────────────────────────────────────────
  {
    id: 'midnight-black', label: 'Midnight Black', description: 'OLED · True black', isLight: false,
    bg: '#000000', s1: '#0a0a0a', s2: '#141414', s3: '#1f1f1f',
    border: '#262626', borderSubtle: '#1a1a1a', borderStrong: '#383838',
    text: '#f5f5f5', textSubtle: '#a3a3a3', textMuted: '#6b6b6b', textDisabled: '#404040',
    accent: '#5b9dff', accentHover: '#3b82f6', accentText: '#03070f',
    success: '#22c55e', warning: '#eab308', error: '#ef4444', info: '#5b9dff', special: '#a855f7',
    scrollbar: '#2a2a2a', scrollbarHover: '#3d3d3d', overlay: 'rgba(0, 0, 0, 0.8)',
  },
  {
    id: 'carbon', label: 'Carbon', description: 'Default · Deep charcoal', isLight: false,
    bg: '#0d1117', s1: '#161b22', s2: '#21262d', s3: '#2d333b',
    border: '#30363d', borderSubtle: '#21262d', borderStrong: '#484f58',
    text: '#e6edf3', textSubtle: '#8b949e', textMuted: '#6e7681', textDisabled: '#484f58',
    accent: '#58a6ff', accentHover: '#4493f8', accentText: '#0d1117',
    success: '#3fb950', warning: '#d29922', error: '#f85149', info: '#58a6ff', special: '#db61a2',
    scrollbar: '#30363d', scrollbarHover: '#484f58', overlay: 'rgba(0, 0, 0, 0.65)',
  },
  {
    id: 'graphite', label: 'Graphite', description: 'Soft dark gray', isLight: false,
    bg: '#1c1c1e', s1: '#242426', s2: '#2c2c2e', s3: '#38383a',
    border: '#3a3a3c', borderSubtle: '#2c2c2e', borderStrong: '#48484a',
    text: '#ebebf0', textSubtle: '#aeaeb2', textMuted: '#7c7c80', textDisabled: '#48484a',
    accent: '#818cf8', accentHover: '#6366f1', accentText: '#ffffff',
    success: '#30d158', warning: '#ffd60a', error: '#ff453a', info: '#818cf8', special: '#bf5af2',
    scrollbar: '#3a3a3c', scrollbarHover: '#48484a', overlay: 'rgba(0, 0, 0, 0.6)',
  },
  {
    id: 'ocean', label: 'Ocean Night', description: 'Linear · Navy dark', isLight: false,
    bg: '#0b1221', s1: '#111a2e', s2: '#18243d', s3: '#22304d',
    border: '#25344f', borderSubtle: '#18243d', borderStrong: '#34466a',
    text: '#dbe5f5', textSubtle: '#93a4c2', textMuted: '#5f7299', textDisabled: '#34466a',
    accent: '#6e8bff', accentHover: '#5872f0', accentText: '#ffffff',
    success: '#4ade80', warning: '#fbbf24', error: '#f87171', info: '#7aa2ff', special: '#818cf8',
    scrollbar: '#25344f', scrollbarHover: '#34466a', overlay: 'rgba(2, 6, 18, 0.7)',
  },
  {
    id: 'forest', label: 'Forest Dark', description: 'Green dark', isLight: false,
    bg: '#0c1410', s1: '#121d17', s2: '#1a2a20', s3: '#24382b',
    border: '#28402f', borderSubtle: '#1a2a20', borderStrong: '#36543f',
    text: '#e3f0e8', textSubtle: '#9cbfa8', textMuted: '#6a8a76', textDisabled: '#36543f',
    accent: '#4ade80', accentHover: '#22c55e', accentText: '#0c1410',
    success: '#4ade80', warning: '#fbbf24', error: '#f87171', info: '#38bdf8', special: '#2dd4bf',
    scrollbar: '#28402f', scrollbarHover: '#36543f', overlay: 'rgba(0, 0, 0, 0.65)',
  },
  {
    id: 'crimson', label: 'Crimson Dark', description: 'Red dark', isLight: false,
    bg: '#160c0e', s1: '#1f1216', s2: '#2b1a1f', s3: '#392329',
    border: '#44292f', borderSubtle: '#2b1a1f', borderStrong: '#5a363d',
    text: '#f5e3e6', textSubtle: '#c89ba3', textMuted: '#936a72', textDisabled: '#44292f',
    accent: '#f43f5e', accentHover: '#e11d48', accentText: '#ffffff',
    success: '#4ade80', warning: '#fbbf24', error: '#fb7185', info: '#60a5fa', special: '#f472b6',
    scrollbar: '#44292f', scrollbarHover: '#5a363d', overlay: 'rgba(0, 0, 0, 0.7)',
  },
  {
    id: 'royal', label: 'Royal Purple', description: 'Premium · Purple', isLight: false,
    bg: '#0f0a1f', s1: '#18112e', s2: '#211836', s3: '#2e2148',
    border: '#332552', borderSubtle: '#211836', borderStrong: '#463670',
    text: '#ece7f7', textSubtle: '#b3a3d4', textMuted: '#7e6ba3', textDisabled: '#463670',
    accent: '#a855f7', accentHover: '#9333ea', accentText: '#ffffff',
    success: '#4ade80', warning: '#fbbf24', error: '#f87171', info: '#c084fc', special: '#d946ef',
    scrollbar: '#332552', scrollbarHover: '#463670', overlay: 'rgba(0, 0, 0, 0.7)',
  },
  {
    id: 'cyber', label: 'Cyber Neon', description: 'Futuristic · Neon', isLight: false,
    bg: '#0a0e16', s1: '#0f1622', s2: '#141f30', s3: '#1c2b42',
    border: '#1f3a4d', borderSubtle: '#141f30', borderStrong: '#2a5066',
    text: '#d6f7ff', textSubtle: '#79c7d9', textMuted: '#4d8499', textDisabled: '#2a5066',
    accent: '#00f0ff', accentHover: '#00d4e0', accentText: '#04141a',
    success: '#00ff9d', warning: '#ffd400', error: '#ff3b6b', info: '#36d6ff', special: '#b14bff',
    scrollbar: '#1f3a4d', scrollbarHover: '#2a5066', overlay: 'rgba(0, 0, 0, 0.75)',
  },
  {
    id: 'nord', label: 'Nord Arctic', description: 'Nord · Blue-gray', isLight: false,
    bg: '#2e3440', s1: '#343b48', s2: '#3b4252', s3: '#434c5e',
    border: '#4c566a', borderSubtle: '#3b4252', borderStrong: '#5a657a',
    text: '#eceff4', textSubtle: '#d8dee9', textMuted: '#9aa5b8', textDisabled: '#5a657a',
    accent: '#88c0d0', accentHover: '#8fbcbb', accentText: '#2e3440',
    success: '#a3be8c', warning: '#ebcb8b', error: '#bf616a', info: '#81a1c1', special: '#b48ead',
    scrollbar: '#4c566a', scrollbarHover: '#5a657a', overlay: 'rgba(0, 0, 0, 0.5)',
  },
];

export const THEME_PRESETS = Object.fromEntries(SPECS.map((s) => [s.id, buildTheme(s)]));

// Metadata for ThemePanel cards (preview swatches + labels).
export const THEME_META = SPECS.map((s) => ({
  id: s.id,
  label: s.label,
  description: s.description,
  isLight: s.isLight,
  preview: { bg: s.bg, surface: s.s1, border: s.border, text: s.text, accent: s.accent },
}));

// Ids of the light themes — used to resolve light/dark UI affordances (toggle icon, isDarkMode).
export const LIGHT_THEME_IDS = SPECS.filter((s) => s.isLight).map((s) => s.id);
