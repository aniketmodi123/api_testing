// Font presets. Each maps to tokens in tokens/typography.js.
// To add a new font: add an object here + register in FONT_META below.

export const FONT_PRESETS = {
  inter: {
    '--font-ui': '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    '--font-mono': '"Roboto Mono", "JetBrains Mono", monospace',
  },
  geist: {
    '--font-ui': '"Geist", "Inter", sans-serif',
    '--font-mono': '"Geist Mono", "JetBrains Mono", monospace',
  },
  system: {
    '--font-ui': '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    '--font-mono': 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
  },
  jetbrains: {
    '--font-ui': '"JetBrains Mono", monospace',
    '--font-mono': '"JetBrains Mono", monospace',
  },
};

export const FONT_META = [
  {
    id: 'inter',
    label: 'Inter',
    description: 'Default · Clean UI font',
    sample: 'Aa',
    fontFamily: '"Inter", sans-serif',
  },
  {
    id: 'geist',
    label: 'Geist',
    description: 'Vercel · Modern',
    sample: 'Aa',
    fontFamily: '"Geist", sans-serif',
  },
  {
    id: 'system',
    label: 'System',
    description: 'Native · Fastest',
    sample: 'Aa',
    fontFamily: '-apple-system, sans-serif',
  },
  {
    id: 'jetbrains',
    label: 'JetBrains Mono',
    description: 'Monospace · Dev style',
    sample: 'Aa',
    fontFamily: '"JetBrains Mono", monospace',
  },
];
