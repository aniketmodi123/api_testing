// Radius presets — control corner rounding across the app.
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
  { id: 'sharp', label: 'Sharp', description: 'Minimal · Technical' },
  { id: 'default', label: 'Default', description: 'Balanced' },
  { id: 'rounded', label: 'Rounded', description: 'Friendly · Soft' },
];
