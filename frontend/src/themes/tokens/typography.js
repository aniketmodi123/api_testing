// Typography token names. Values owned by presets/fonts.js.
// Adding a new size scale or font category: add keys here + values in presets.

export const TYPOGRAPHY_TOKEN_KEYS = [
  '--font-ui',
  '--font-mono',
  '--text-xs',
  '--text-sm',
  '--text-base',
  '--text-md',
  '--text-lg',
  '--line-height',
];

// Tokens that never change between font presets
export const STATIC_TYPOGRAPHY_TOKENS = {
  '--text-xs': '11px',
  '--text-sm': '12px',
  '--text-base': '13px',
  '--text-md': '14px',
  '--text-lg': '16px',
  '--line-height': '1rem',
};
