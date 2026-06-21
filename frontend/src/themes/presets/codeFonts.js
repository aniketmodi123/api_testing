// Code font presets — set the monospace font (--font-mono) used in code blocks, JSON editors,
// method labels, and response bodies. Independent of the UI font.
//
// Berkeley Mono and MonoLisa are commercial fonts that cannot be bundled — they fall back to
// JetBrains Mono unless the user installs them locally or drops @font-face files (see global.css).
// `sample` strings expose the glyphs that distinguish monospace fonts: 0/O, 1/l/I, brackets.

export const CODE_FONT_PRESETS = {
  berkeley: { '--font-mono': '"Berkeley Mono", "JetBrains Mono", ui-monospace, monospace' },
  jetbrains: { '--font-mono': '"JetBrains Mono", ui-monospace, monospace' },
  monolisa: { '--font-mono': '"MonoLisa", "JetBrains Mono", ui-monospace, monospace' },
  cascadia: { '--font-mono': '"Cascadia Code", ui-monospace, monospace' },
  ibmplex: { '--font-mono': '"IBM Plex Mono", ui-monospace, monospace' },
};

export const CODE_FONT_META = [
  { id: 'berkeley', label: 'Berkeley Mono', description: 'Premium · Install locally', sample: '0O1lI', fontFamily: '"Berkeley Mono", monospace' },
  { id: 'jetbrains', label: 'JetBrains Mono', description: 'Default · Dev classic', sample: '0O1lI', fontFamily: '"JetBrains Mono", monospace' },
  { id: 'monolisa', label: 'MonoLisa', description: 'Premium · Install locally', sample: '0O1lI', fontFamily: '"MonoLisa", monospace' },
  { id: 'cascadia', label: 'Cascadia Code', description: 'Microsoft · Ligatures', sample: '=>{}', fontFamily: '"Cascadia Code", monospace' },
  { id: 'ibmplex', label: 'IBM Plex Mono', description: 'Editorial', sample: '0O1lI', fontFamily: '"IBM Plex Mono", monospace' },
];
