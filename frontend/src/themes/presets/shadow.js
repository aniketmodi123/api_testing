// Shadow presets — control surface depth across the app.
export const SHADOW_PRESETS = {
  flat: {
    '--shadow-sm': 'none',
    '--shadow-md': 'none',
    '--shadow-lg': 'none',
  },
  default: {
    '--shadow-sm': '0 1px 2px rgba(0,0,0,0.12)',
    '--shadow-md': '0 2px 8px rgba(0,0,0,0.16)',
    '--shadow-lg': '0 4px 16px rgba(0,0,0,0.2)',
  },
  elevated: {
    '--shadow-sm': '0 2px 4px rgba(0,0,0,0.2)',
    '--shadow-md': '0 4px 16px rgba(0,0,0,0.28)',
    '--shadow-lg': '0 8px 32px rgba(0,0,0,0.36)',
  },
};

export const SHADOW_META = [
  { id: 'flat', label: 'Flat', description: 'No depth · Clean' },
  { id: 'default', label: 'Default', description: 'Subtle depth' },
  { id: 'elevated', label: 'Elevated', description: 'Strong depth' },
];
