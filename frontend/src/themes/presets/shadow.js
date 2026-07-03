// Shadow presets — control surface depth across the app. 5 steps from no depth to a
// glassy glow so elevation changes read clearly when cards stack.
export const SHADOW_PRESETS = {
  flat: {
    '--shadow-sm': 'none',
    '--shadow-md': 'none',
    '--shadow-lg': 'none',
  },
  soft: {
    '--shadow-sm': '0 1px 2px rgba(0,0,0,0.12)',
    '--shadow-md': '0 2px 8px rgba(0,0,0,0.16)',
    '--shadow-lg': '0 4px 16px rgba(0,0,0,0.2)',
  },
  elevated: {
    '--shadow-sm': '0 2px 4px rgba(0,0,0,0.2)',
    '--shadow-md': '0 4px 16px rgba(0,0,0,0.28)',
    '--shadow-lg': '0 8px 32px rgba(0,0,0,0.36)',
  },
  floating: {
    '--shadow-sm': '0 4px 12px rgba(0,0,0,0.3)',
    '--shadow-md': '0 10px 28px rgba(0,0,0,0.4)',
    '--shadow-lg': '0 18px 48px rgba(0,0,0,0.5)',
  },
  glass: {
    '--shadow-sm': '0 2px 12px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)',
    '--shadow-md': '0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.08)',
    '--shadow-lg': '0 16px 48px rgba(0,0,0,0.4), 0 0 24px var(--accent-dim), inset 0 1px 0 rgba(255,255,255,0.1)',
  },
};

export const SHADOW_META = [
  { id: 'flat', label: 'Flat', description: 'No depth · Clean' },
  { id: 'soft', label: 'Soft', description: 'Subtle shadow' },
  { id: 'elevated', label: 'Elevated', description: 'Material depth' },
  { id: 'floating', label: 'Floating', description: 'Strong depth' },
  { id: 'glass', label: 'Glass', description: 'Glow + highlight' },
];
