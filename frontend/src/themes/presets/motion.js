// Motion presets — control transition durations + easing across the app.
export const MOTION_PRESETS = {
  none: {
    '--duration-fast': '0ms',
    '--duration-base': '0ms',
    '--duration-slow': '0ms',
    '--easing-default': 'linear',
    '--easing-spring': 'linear',
  },
  subtle: {
    '--duration-fast': '80ms',
    '--duration-base': '120ms',
    '--duration-slow': '180ms',
    '--easing-default': 'cubic-bezier(0.16, 1, 0.3, 1)',
    '--easing-spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  full: {
    '--duration-fast': '100ms',
    '--duration-base': '160ms',
    '--duration-slow': '260ms',
    '--easing-default': 'cubic-bezier(0.16, 1, 0.3, 1)',
    '--easing-spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
};

export const MOTION_META = [
  { id: 'none', label: 'None', description: 'Instant · No animation' },
  { id: 'subtle', label: 'Subtle', description: 'Quick · Understated' },
  { id: 'full', label: 'Full', description: 'Fluid · Expressive' },
];
