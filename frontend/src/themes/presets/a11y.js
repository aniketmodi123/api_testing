// Accessibility presets — orthogonal overlays applied last (win over theme + dimensions).
//   standard     → no overrides
//   highcontrast → stronger borders, promote subtle/muted text toward primary, visible focus ring
//   largetext    → bump the --text-* scale ~1.15× for low-vision comfort

export const A11Y_PRESETS = {
  standard: {},
  highcontrast: {
    '--border': 'var(--border-strong)',
    '--border-subtle': 'var(--border)',
    '--text-subtle': 'var(--text)',
    '--text-muted': 'var(--text-subtle)',
    '--focus-ring': '2px solid var(--accent)',
  },
  largetext: {
    '--text-xs': '13px',
    '--text-sm': '14px',
    '--text-base': '15px',
    '--text-md': '16px',
    '--text-lg': '18px',
  },
};

export const A11Y_META = [
  { id: 'standard', label: 'Standard', description: 'Default contrast + sizing' },
  { id: 'highcontrast', label: 'High Contrast', description: 'Stronger borders + text' },
  { id: 'largetext', label: 'Large Text', description: 'Bigger type · Low-vision' },
];
