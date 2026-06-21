// Code-editor (syntax) themes — scope the code block + JSON syntax colors.
// Drives --viz-json-* (key/string/number/boolean/null) and the --code-* surfaces.
// Independent of the color theme so users can pair any UI theme with any syntax theme.

export const EDITOR_PRESETS = {
  tokyonight: {
    '--code-bg': '#16161e', '--code-bg-deeper': '#1a1b26', '--code-border': '#2a2e3a',
    '--code-gutter-bg': '#16161e', '--code-active-line': 'rgba(122, 162, 247, 0.08)',
    '--code-selection': 'rgba(122, 162, 247, 0.18)',
    '--viz-json-key': '#7aa2f7', '--viz-json-string': '#9ece6a', '--viz-json-number': '#ff9e64',
    '--viz-json-boolean': '#bb9af7', '--viz-json-null': '#f7768e',
  },
  github: {
    '--code-bg': '#0d1117', '--code-bg-deeper': '#010409', '--code-border': '#30363d',
    '--code-gutter-bg': '#0d1117', '--code-active-line': 'rgba(56, 139, 253, 0.10)',
    '--code-selection': 'rgba(56, 139, 253, 0.20)',
    '--viz-json-key': '#7ee787', '--viz-json-string': '#a5d6ff', '--viz-json-number': '#79c0ff',
    '--viz-json-boolean': '#79c0ff', '--viz-json-null': '#ff7b72',
  },
  onedark: {
    '--code-bg': '#282c34', '--code-bg-deeper': '#21252b', '--code-border': '#3b4048',
    '--code-gutter-bg': '#282c34', '--code-active-line': 'rgba(99, 110, 123, 0.18)',
    '--code-selection': 'rgba(99, 110, 123, 0.30)',
    '--viz-json-key': '#e06c75', '--viz-json-string': '#98c379', '--viz-json-number': '#d19a66',
    '--viz-json-boolean': '#56b6c2', '--viz-json-null': '#c678dd',
  },
  catppuccin: {
    '--code-bg': '#1e1e2e', '--code-bg-deeper': '#181825', '--code-border': '#313244',
    '--code-gutter-bg': '#1e1e2e', '--code-active-line': 'rgba(137, 220, 235, 0.08)',
    '--code-selection': 'rgba(137, 220, 235, 0.18)',
    '--viz-json-key': '#89dceb', '--viz-json-string': '#a6e3a1', '--viz-json-number': '#fab387',
    '--viz-json-boolean': '#f9e2af', '--viz-json-null': '#f38ba8',
  },
  monokai: {
    '--code-bg': '#272822', '--code-bg-deeper': '#1e1f1c', '--code-border': '#3e3d32',
    '--code-gutter-bg': '#272822', '--code-active-line': 'rgba(166, 226, 46, 0.08)',
    '--code-selection': 'rgba(166, 226, 46, 0.16)',
    '--viz-json-key': '#a6e22e', '--viz-json-string': '#e6db74', '--viz-json-number': '#ae81ff',
    '--viz-json-boolean': '#ae81ff', '--viz-json-null': '#f92672',
  },
};

export const EDITOR_META = [
  { id: 'tokyonight', label: 'Tokyo Night', description: 'Default · Cool blue', preview: { bg: '#16161e', key: '#7aa2f7', string: '#9ece6a', number: '#ff9e64' } },
  { id: 'github', label: 'GitHub', description: 'Familiar · Dark', preview: { bg: '#0d1117', key: '#7ee787', string: '#a5d6ff', number: '#79c0ff' } },
  { id: 'onedark', label: 'One Dark', description: 'Atom classic', preview: { bg: '#282c34', key: '#e06c75', string: '#98c379', number: '#d19a66' } },
  { id: 'catppuccin', label: 'Catppuccin', description: 'Soft · Pastel', preview: { bg: '#1e1e2e', key: '#89dceb', string: '#a6e3a1', number: '#fab387' } },
  { id: 'monokai', label: 'Monokai', description: 'Vivid · Classic', preview: { bg: '#272822', key: '#a6e22e', string: '#e6db74', number: '#ae81ff' } },
];
