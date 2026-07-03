// Phase G — seed data for the Marketplace screen. Each entry mirrors a well-known
// community theme (Tokyo Night, Catppuccin, etc). `palette` drives the 4-swatch card
// preview; `token_map` is the partial override Install merges into the live app + saves
// as a custom theme (same shape CustomThemeEditor/ThemeBuilder already persist).
import { deriveAccent, hexToDim } from '../themes/customTheme.js';

// Build a coherent token_map from a 4-color palette ([bg, surface, accent, secondaryAccent])
// plus the few extra hex values each theme needs for text/border/syntax. Centralizing this
// keeps every seed theme internally consistent instead of hand-tuning six token maps.
function buildTokenMap({ bg, surface1, surface2, surface3, border, text, textSubtle, textMuted, accent, secondaryAccent }) {
  return {
    '--bg': bg,
    '--surface-1': surface1,
    '--surface-2': surface2,
    '--surface-3': surface3,
    '--border': border,
    '--text': text,
    '--text-subtle': textSubtle,
    '--text-muted': textMuted,
    '--accent': accent,
    '--accent-hover': accent,
    '--accent-dim': hexToDim(accent, 0.12),
    '--accent-text': '#ffffff',
    ...deriveAccent(accent),
    '--viz-json-key': accent,
    '--viz-json-string': secondaryAccent,
    '--viz-json-number': textSubtle,
    '--viz-json-boolean': secondaryAccent,
    '--viz-json-null': textMuted,
  };
}

export const MARKETPLACE_THEMES = [
  {
    id: 'tokyo-night-pro',
    name: 'Tokyo Night Pro',
    author: 'enkia',
    tag: 'Dark',
    installs: 48200,
    palette: ['#1a1b26', '#24283b', '#7AA2F7', '#BB9AF7'],
    token_map: buildTokenMap({
      bg: '#1a1b26', surface1: '#1f2335', surface2: '#24283b', surface3: '#2d324a',
      border: '#3b4261', text: '#c0caf5', textSubtle: '#9aa5ce', textMuted: '#6b7394',
      accent: '#7AA2F7', secondaryAccent: '#BB9AF7',
    }),
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    author: 'catppuccin',
    tag: 'Dark',
    installs: 91700,
    palette: ['#1e1e2e', '#313244', '#cba6f7', '#94e2d5'],
    token_map: buildTokenMap({
      bg: '#1e1e2e', surface1: '#252537', surface2: '#313244', surface3: '#45475a',
      border: '#45475a', text: '#cdd6f4', textSubtle: '#a6adc8', textMuted: '#7f849c',
      accent: '#cba6f7', secondaryAccent: '#94e2d5',
    }),
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    author: 'morhetz',
    tag: 'Warm',
    installs: 33000,
    palette: ['#282828', '#3c3836', '#fabd2f', '#b8bb26'],
    token_map: buildTokenMap({
      bg: '#282828', surface1: '#32302f', surface2: '#3c3836', surface3: '#504945',
      border: '#504945', text: '#ebdbb2', textSubtle: '#d5c4a1', textMuted: '#a89984',
      accent: '#fabd2f', secondaryAccent: '#b8bb26',
    }),
  },
  {
    id: 'nord',
    name: 'Nord',
    author: 'arcticicestudio',
    tag: 'Cool',
    installs: 71400,
    palette: ['#2e3440', '#3b4252', '#88c0d0', '#a3be8c'],
    token_map: buildTokenMap({
      bg: '#2e3440', surface1: '#343b4a', surface2: '#3b4252', surface3: '#434c5e',
      border: '#4c566a', text: '#eceff4', textSubtle: '#d8dee9', textMuted: '#9099ab',
      accent: '#88c0d0', secondaryAccent: '#a3be8c',
    }),
  },
  {
    id: 'rose-pine',
    name: 'Rosé Pine',
    author: 'rose-pine',
    tag: 'Dark',
    installs: 56800,
    palette: ['#191724', '#26233a', '#ebbcba', '#9ccfd8'],
    token_map: buildTokenMap({
      bg: '#191724', surface1: '#1f1d2e', surface2: '#26233a', surface3: '#403d52',
      border: '#403d52', text: '#e0def4', textSubtle: '#c1c0d4', textMuted: '#908caa',
      accent: '#ebbcba', secondaryAccent: '#9ccfd8',
    }),
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    author: 'altercation',
    tag: 'Light',
    installs: 40100,
    palette: ['#FFFFFF', '#FDF6E3', '#268BD2', '#2AA198'],
    token_map: buildTokenMap({
      bg: '#FFFFFF', surface1: '#FDF6E3', surface2: '#EEE8D5', surface3: '#E4DEC8',
      border: '#D3CBB7', text: '#073642', textSubtle: '#586e75', textMuted: '#93a1a1',
      accent: '#268BD2', secondaryAccent: '#2AA198',
    }),
  },
];
