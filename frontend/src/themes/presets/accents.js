// Accent presets — override the theme's accent independently of the color theme.
// `default` keeps the theme's own accent (value === null → engine skips applying).
// Component tokens in themes.js reference var(--accent), so overriding these
// cascades automatically to buttons, focus rings, sidebar active state, etc.

export const ACCENT_PRESETS = {
  default: { value: null },
  blue: {
    value: {
      '--accent': '#3b82f6', '--accent-hover': '#2563eb',
      '--accent-text': '#ffffff', '--accent-dim': 'rgba(59, 130, 246, 0.14)',
    },
  },
  indigo: {
    value: {
      '--accent': '#6366f1', '--accent-hover': '#4f46e5',
      '--accent-text': '#ffffff', '--accent-dim': 'rgba(99, 102, 241, 0.14)',
    },
  },
  cyan: {
    value: {
      '--accent': '#06b6d4', '--accent-hover': '#0891b2',
      '--accent-text': '#06262e', '--accent-dim': 'rgba(6, 182, 212, 0.14)',
    },
  },
  green: {
    value: {
      '--accent': '#22c55e', '--accent-hover': '#16a34a',
      '--accent-text': '#052e16', '--accent-dim': 'rgba(34, 197, 94, 0.14)',
    },
  },
  orange: {
    value: {
      '--accent': '#f97316', '--accent-hover': '#ea580c',
      '--accent-text': '#2a1206', '--accent-dim': 'rgba(249, 115, 22, 0.14)',
    },
  },
  red: {
    value: {
      '--accent': '#ef4444', '--accent-hover': '#dc2626',
      '--accent-text': '#ffffff', '--accent-dim': 'rgba(239, 68, 68, 0.14)',
    },
  },
  teal: {
    value: {
      '--accent': '#2dd4bf', '--accent-hover': '#14b8a6',
      '--accent-text': '#08312a', '--accent-dim': 'rgba(45, 212, 191, 0.14)',
    },
  },
};

export const ACCENT_META = [
  { id: 'default', label: 'Theme default', swatch: null },
  { id: 'blue', label: 'Blue', swatch: '#3b82f6' },
  { id: 'indigo', label: 'Indigo', swatch: '#6366f1' },
  { id: 'cyan', label: 'Cyan', swatch: '#06b6d4' },
  { id: 'green', label: 'Green', swatch: '#22c55e' },
  { id: 'orange', label: 'Orange', swatch: '#f97316' },
  { id: 'red', label: 'Red', swatch: '#ef4444' },
  { id: 'teal', label: 'Teal', swatch: '#2dd4bf' },
];
