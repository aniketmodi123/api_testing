// UI font presets. Each sets --font-ui (the app's interface font). --font-mono is kept as a
// sane fallback but is normally overridden by the separate code-font preset (applied after).
// Web fonts are loaded in index.html / global.css; SF Pro resolves from the native system stack.

export const FONT_PRESETS = {
  inter: {
    '--font-ui': '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    '--font-mono': '"JetBrains Mono", ui-monospace, monospace',
  },
  geist: {
    '--font-ui': '"Geist", "Inter", sans-serif',
    '--font-mono': '"Geist Mono", "JetBrains Mono", monospace',
  },
  sfpro: {
    '--font-ui': '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro", "Segoe UI", sans-serif',
    '--font-mono': 'ui-monospace, "SF Mono", "JetBrains Mono", monospace',
  },
  ibmplexsans: {
    '--font-ui': '"IBM Plex Sans", "Inter", sans-serif',
    '--font-mono': '"IBM Plex Mono", "JetBrains Mono", monospace',
  },
  sourcesans: {
    '--font-ui': '"Source Sans 3", "Source Sans Pro", "Inter", sans-serif',
    '--font-mono': '"JetBrains Mono", ui-monospace, monospace',
  },
};

export const FONT_META = [
  { id: 'inter', label: 'Inter', description: 'Default · Clean UI font', sample: 'Aa', fontFamily: '"Inter", sans-serif' },
  { id: 'geist', label: 'Geist', description: 'Vercel · Modern', sample: 'Aa', fontFamily: '"Geist", sans-serif' },
  { id: 'sfpro', label: 'SF Pro', description: 'Apple · System native', sample: 'Aa', fontFamily: '-apple-system, "SF Pro Text", sans-serif' },
  { id: 'ibmplexsans', label: 'IBM Plex Sans', description: 'Editorial · Technical', sample: 'Aa', fontFamily: '"IBM Plex Sans", sans-serif' },
  { id: 'sourcesans', label: 'Source Sans', description: 'Adobe · Long reading', sample: 'Aa', fontFamily: '"Source Sans 3", sans-serif' },
];
