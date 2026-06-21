// Code font presets — set the monospace font (--font-mono) used in code blocks,
// JSON editors, method labels, and response bodies. Independent of the UI font.

export const CODE_FONT_PRESETS = {
  jetbrains: { '--font-mono': '"JetBrains Mono", ui-monospace, monospace' },
  geistmono: { '--font-mono': '"Geist Mono", ui-monospace, monospace' },
  firacode: { '--font-mono': '"Fira Code", ui-monospace, monospace' },
  ibmplex: { '--font-mono': '"IBM Plex Mono", ui-monospace, monospace' },
};

export const CODE_FONT_META = [
  { id: 'jetbrains', label: 'JetBrains Mono', description: 'Default · Dev classic', sample: '{ }', fontFamily: '"JetBrains Mono", monospace' },
  { id: 'geistmono', label: 'Geist Mono', description: 'Vercel · Clean', sample: '{ }', fontFamily: '"Geist Mono", monospace' },
  { id: 'firacode', label: 'Fira Code', description: 'Ligatures', sample: '=>', fontFamily: '"Fira Code", monospace' },
  { id: 'ibmplex', label: 'IBM Plex Mono', description: 'Editorial', sample: '{ }', fontFamily: '"IBM Plex Mono", monospace' },
];
