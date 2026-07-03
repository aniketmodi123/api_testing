// Radius presets — control corner rounding across the app. 5 dramatic steps so the
// difference is obvious at a glance: Sharp (0) → Pill (fully rounded).
export const RADIUS_PRESETS = {
  sharp: {
    '--radius-sm': '0px', '--radius': '0px', '--radius-md': '0px',
    '--radius-lg': '0px', '--radius-xl': '0px',
  },
  compact: {
    '--radius-sm': '4px', '--radius': '6px', '--radius-md': '6px',
    '--radius-lg': '8px', '--radius-xl': '10px',
  },
  modern: {
    '--radius-sm': '8px', '--radius': '10px', '--radius-md': '12px',
    '--radius-lg': '14px', '--radius-xl': '18px',
  },
  friendly: {
    '--radius-sm': '12px', '--radius': '16px', '--radius-md': '20px',
    '--radius-lg': '24px', '--radius-xl': '28px',
  },
  pill: {
    '--radius-sm': '999px', '--radius': '999px', '--radius-md': '999px',
    '--radius-lg': '999px', '--radius-xl': '999px',
  },
};

export const RADIUS_META = [
  { id: 'sharp', label: 'Sharp', description: '0px · Technical' },
  { id: 'compact', label: 'Compact', description: '6px · Tight' },
  { id: 'modern', label: 'Modern', description: '12px · Balanced' },
  { id: 'friendly', label: 'Friendly', description: '20px · Soft' },
  { id: 'pill', label: 'Pill', description: 'Fully rounded' },
];
