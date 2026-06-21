// Motion presets — control transition durations + easing across the app. 5 steps from
// Instant (no animation) to Expressive (slow, springy) so motion changes are visible.
export const MOTION_PRESETS = {
  instant: {
    '--duration-fast': '0ms',
    '--duration-base': '0ms',
    '--duration-slow': '0ms',
    '--easing-default': 'linear',
    '--easing-spring': 'linear',
  },
  // Sharp deceleration — snaps to rest. Instant-feeling start, no settle.
  fast: {
    '--duration-fast': '90ms',
    '--duration-base': '130ms',
    '--duration-slow': '180ms',
    '--easing-default': 'cubic-bezier(0.2, 0, 0, 1)',
    '--easing-spring': 'cubic-bezier(0.2, 0, 0, 1)',
  },
  // Expo ease-out — fast off the line, soft glide into rest.
  balanced: {
    '--duration-fast': '160ms',
    '--duration-base': '240ms',
    '--duration-slow': '320ms',
    '--easing-default': 'cubic-bezier(0.16, 1, 0.3, 1)',
    '--easing-spring': 'cubic-bezier(0.34, 1.4, 0.64, 1)',
  },
  // Sine ease-in-out — accelerates AND decelerates, flowing both ends (distinct feel).
  smooth: {
    '--duration-fast': '260ms',
    '--duration-base': '380ms',
    '--duration-slow': '520ms',
    '--easing-default': 'cubic-bezier(0.65, 0, 0.35, 1)',
    '--easing-spring': 'cubic-bezier(0.45, 1.3, 0.5, 1)',
  },
  // Back-out overshoot — shoots past the target and bounces back. Springy character.
  expressive: {
    '--duration-fast': '360ms',
    '--duration-base': '520ms',
    '--duration-slow': '700ms',
    '--easing-default': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    '--easing-spring': 'cubic-bezier(0.34, 1.8, 0.5, 1)',
  },
};

export const MOTION_META = [
  { id: 'instant', label: 'Instant', description: 'No animation' },
  { id: 'fast', label: 'Fast', description: 'Snappy · Sharp stop' },
  { id: 'balanced', label: 'Balanced', description: 'Default · Soft glide' },
  { id: 'smooth', label: 'Smooth', description: 'Flowing · Ease in-out' },
  { id: 'expressive', label: 'Expressive', description: 'Springy · Overshoot' },
];
