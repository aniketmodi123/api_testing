// Accent presets — override the theme's accent independently of the color theme.
// `default` keeps the theme's own accent (value === null → engine skips applying).
// Component tokens in themes.js reference var(--accent), so overriding these
// cascades automatically to buttons, focus rings, sidebar active state, etc.
//
// 12 globally proven accents. `--accent-text` is the text color that sits on the accent
// fill: dark for light/saturated hues (amber, yellow, green, etc.), white for the rest.

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
  purple: {
    value: {
      '--accent': '#8b5cf6', '--accent-hover': '#7c3aed',
      '--accent-text': '#ffffff', '--accent-dim': 'rgba(139, 92, 246, 0.14)',
    },
  },
  pink: {
    value: {
      '--accent': '#ec4899', '--accent-hover': '#db2777',
      '--accent-text': '#ffffff', '--accent-dim': 'rgba(236, 72, 153, 0.14)',
    },
  },
  red: {
    value: {
      '--accent': '#ef4444', '--accent-hover': '#dc2626',
      '--accent-text': '#ffffff', '--accent-dim': 'rgba(239, 68, 68, 0.14)',
    },
  },
  orange: {
    value: {
      '--accent': '#f97316', '--accent-hover': '#ea580c',
      '--accent-text': '#2a1206', '--accent-dim': 'rgba(249, 115, 22, 0.14)',
    },
  },
  amber: {
    value: {
      '--accent': '#f59e0b', '--accent-hover': '#d97706',
      '--accent-text': '#2a1a02', '--accent-dim': 'rgba(245, 158, 11, 0.14)',
    },
  },
  yellow: {
    value: {
      '--accent': '#eab308', '--accent-hover': '#ca8a04',
      '--accent-text': '#2a2102', '--accent-dim': 'rgba(234, 179, 8, 0.14)',
    },
  },
  green: {
    value: {
      '--accent': '#22c55e', '--accent-hover': '#16a34a',
      '--accent-text': '#052e16', '--accent-dim': 'rgba(34, 197, 94, 0.14)',
    },
  },
  emerald: {
    value: {
      '--accent': '#10b981', '--accent-hover': '#059669',
      '--accent-text': '#02231a', '--accent-dim': 'rgba(16, 185, 129, 0.14)',
    },
  },
  teal: {
    value: {
      '--accent': '#14b8a6', '--accent-hover': '#0d9488',
      '--accent-text': '#02231f', '--accent-dim': 'rgba(20, 184, 166, 0.14)',
    },
  },
  cyan: {
    value: {
      '--accent': '#06b6d4', '--accent-hover': '#0891b2',
      '--accent-text': '#06262e', '--accent-dim': 'rgba(6, 182, 212, 0.14)',
    },
  },
};

export const ACCENT_META = [
  { id: 'default', label: 'Theme default', swatch: null },
  { id: 'blue', label: 'Blue', swatch: '#3b82f6' },
  { id: 'indigo', label: 'Indigo', swatch: '#6366f1' },
  { id: 'purple', label: 'Purple', swatch: '#8b5cf6' },
  { id: 'pink', label: 'Pink', swatch: '#ec4899' },
  { id: 'red', label: 'Red', swatch: '#ef4444' },
  { id: 'orange', label: 'Orange', swatch: '#f97316' },
  { id: 'amber', label: 'Amber', swatch: '#f59e0b' },
  { id: 'yellow', label: 'Yellow', swatch: '#eab308' },
  { id: 'green', label: 'Green', swatch: '#22c55e' },
  { id: 'emerald', label: 'Emerald', swatch: '#10b981' },
  { id: 'teal', label: 'Teal', swatch: '#14b8a6' },
  { id: 'cyan', label: 'Cyan', swatch: '#06b6d4' },
];
