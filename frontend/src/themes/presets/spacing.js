// Density presets — control the --space-* scale used across the app.
export const SPACING_PRESETS = {
  compact: {
    '--space-1': '3px', '--space-2': '6px', '--space-3': '9px',
    '--space-4': '12px', '--space-5': '16px', '--space-6': '20px',
  },
  default: {
    '--space-1': '4px', '--space-2': '8px', '--space-3': '12px',
    '--space-4': '16px', '--space-5': '20px', '--space-6': '24px',
  },
  comfortable: {
    '--space-1': '5px', '--space-2': '10px', '--space-3': '16px',
    '--space-4': '20px', '--space-5': '28px', '--space-6': '36px',
  },
};

export const SPACING_META = [
  { id: 'compact', label: 'Compact', description: 'Denser · More content' },
  { id: 'default', label: 'Default', description: 'Balanced · Standard' },
  { id: 'comfortable', label: 'Comfortable', description: 'Airy · More breathing room' },
];
