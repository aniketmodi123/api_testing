const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/styles/global.css');

let content = fs.readFileSync(file, 'utf8');

const rootRegex = /:root\s*\{[\s\S]*?\}(?=\s*\[data-theme="light"\])/;
const lightRegex = /\[data-theme="light"\]\s*\{[\s\S]*?\}/;

const newRoot = `:root {
  /* === THEME 2: MID DARK (DEFAULT) === */
  --bg: #16181D;
  --surface-1: #1A1D24;
  --surface-2: #20242D;
  --surface-3: #2A303A;
  --border: #353C49;
  --border-subtle: #4b5260;

  --text: #E6EDF3;
  --text-subtle: #9BA3AF;
  --text-muted: #6B7280;

  --accent: #6C72FF;
  --accent-hover: #5A5EE6;
  --accent-dim: rgba(108, 114, 255, 0.10);
  --accent-text: #ffffff;

  --success: #4AC26B;
  --success-dim: rgba(74, 194, 107, 0.10);
  --warning: #D8A441;
  --warning-dim: rgba(216, 164, 65, 0.10);
  --error: #F05D56;
  --error-dim: rgba(240, 93, 86, 0.10);
  --info: #6C72FF;
  --info-dim: rgba(108, 114, 255, 0.10);

  /* === HTTP METHOD COLORS === */
  --method-get: #3FB950;
  --method-post: #58A6FF;
  --method-put: #D29922;
  --method-patch: #A371F7;
  --method-delete: #F85149;
  --method-head: #58A6FF;
  --method-options: #A371F7;

  /* JSON Syntax Highlighting */
  --json-key: #79C0FF;
  --json-string: #A5D6A7;
  --json-number: #D29922;
  --json-boolean: #A371F7;
  --json-null: #F85149;

  /* === TYPOGRAPHY === */
  --font-ui: "Inter", "Geist", -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: "Roboto Mono", "JetBrains Mono", monospace;
  --text-xs: 11px;
  --text-sm: 12px;
  --text-base: 13px;
  --text-md: 14px;
  --text-lg: 16px;

  /* === SPACING === */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;

  /* === SHAPE === */
  --radius-sm: 6px;
  --radius: 8px;
  --radius-md: 10px;
  --radius-lg: 12px;
  --radius-xl: 16px;

  /* === LAYOUT DIMENSIONS === */
  --sidebar-width: 48px;
  --header-height: 44px;
  --tab-bar-height: 36px;
  --panel-min-width: 200px;

  /* === SHADOWS === */
  --shadow-sm: none;
  --shadow-md: none;
  --shadow-lg: none;

  /* === SCROLLBAR === */
  --scrollbar-width: 4px;
  --scrollbar-track: transparent;
  --scrollbar-thumb: #3f3f46;
  --scrollbar-thumb-hover: #52525b;

  /* KEEP BACKWARD COMPAT (old names mapped to new ones if necessary) */
  --background: var(--bg);
  --background-lighter: var(--surface-2);
  --primary-background: var(--surface-1);
  --sidebar-background: var(--surface-1);
  --input-background: var(--surface-2);
  --text-warn: var(--error);
  --border-color: var(--border);
  --primary: var(--accent);
  --primary-dark: var(--accent-hover);
  --primary-text: var(--accent-text);
  --hover-background: var(--surface-3);
  --selected-item-background: var(--accent-dim);
  --disabled: #3f3f46;
  --header-bg: var(--surface-1);
  --card-bg: var(--surface-2);
  --input: var(--surface-2);
  
  --p0-bg: var(--bg);
  --p0-surface: var(--surface-1);
  --p0-surface-2: var(--surface-2);
  --p0-surface-3: var(--surface-3);
  --p0-border: var(--border);
  --p0-text: var(--text);
  --p0-text-muted: var(--text-muted);
  --p0-text-subtle: var(--text-subtle);
  --p0-primary: var(--accent);
  --p0-primary-hover: var(--accent-hover);
  --p0-primary-dim: var(--accent-dim);
  --p0-success: var(--success);
  --p0-warning: var(--warning);
  --p0-error: var(--error);
  --p0-info: var(--info);
  --p0-font-ui: var(--font-ui);
  --p0-font-mono: var(--font-mono);
  --p0-font-size: var(--text-sm);
  --p0-radius: var(--radius);
  --bg-old: var(--bg);
  --text-color: var(--text);
  --muted: var(--text-muted);
}
`;

const newLight = `[data-theme="light"] {
  --bg: #F6F8FA;
  --surface-1: #FFFFFF;
  --surface-2: #FFFFFF;
  --surface-3: #F3F4F6;
  --border: #D0D7DE;
  --border-subtle: #e5e7eb;

  --text: #1F2328;
  --text-subtle: #57606A;
  --text-muted: #8C959F;

  --accent: #4F6EF7;
  --accent-hover: #3b5bdb;
  --accent-dim: rgba(79, 110, 247, 0.10);

  --success: #1A7F37;
  --warning: #BF8700;
  --error: #CF222E;
  
  --scrollbar-thumb: #b0b0bc;
  --scrollbar-thumb-hover: #8888a0;

  /* Backward Compat... */
  --background: var(--bg);
  --background-lighter: var(--surface-2);
  --primary-background: var(--surface-1);
  --sidebar-background: var(--surface-1);
  --input-background: var(--surface-2);
  --text-warn: var(--error);
  --border-color: var(--border);
  --primary: var(--accent);
  --primary-dark: var(--accent-hover);
  --primary-text: var(--accent-text);
  --hover-background: var(--surface-3);
  --selected-item-background: var(--accent-dim);
  --header-bg: var(--surface-1);
  --card-bg: var(--surface-2);
  --input: var(--surface-2);

  --p0-bg: var(--bg);
  --p0-surface: var(--surface-1);
  --p0-surface-2: var(--surface-2);
  --p0-surface-3: var(--surface-3);
  --p0-border: var(--border);
  --p0-text: var(--text);
  --p0-text-muted: var(--text-muted);
  --p0-text-subtle: var(--text-subtle);
  --bg-old: var(--bg);
  --text-color: var(--text);
  --muted: var(--text-muted);
}

[data-theme="deep-dark"] {
  --bg: #0D1117;
  --surface-1: #11161D;
  --surface-2: #161B22;
  --surface-3: #21262D;
  --border: #30363D;
  --border-subtle: #484f58;

  --text: #E6EDF3;
  --text-subtle: #8B949E;
  --text-muted: #484F58;

  --accent: #6C72FF;
  --accent-hover: #5A5EE6;
  --accent-dim: rgba(108, 114, 255, 0.10);

  --success: #3FB950;
  --warning: #D29922;
  --error: #F85149;

  --scrollbar-thumb: #3f3f46;
  --scrollbar-thumb-hover: #52525b;

  /* Backward Compat... */
  --background: var(--bg);
  --background-lighter: var(--surface-2);
  --primary-background: var(--surface-1);
  --sidebar-background: var(--surface-1);
  --input-background: var(--surface-2);
  --text-warn: var(--error);
  --border-color: var(--border);
  --primary: var(--accent);
  --primary-dark: var(--accent-hover);
  --primary-text: var(--accent-text);
  --hover-background: var(--surface-3);
  --selected-item-background: var(--accent-dim);
  --disabled: #3f3f46;
  --header-bg: var(--surface-1);
  --card-bg: var(--surface-2);
  --input: var(--surface-2);

  --p0-bg: var(--bg);
  --p0-surface: var(--surface-1);
  --p0-surface-2: var(--surface-2);
  --p0-surface-3: var(--surface-3);
  --p0-border: var(--border);
  --p0-text: var(--text);
  --p0-text-muted: var(--text-muted);
  --p0-text-subtle: var(--text-subtle);
  --bg-old: var(--bg);
  --text-color: var(--text);
  --muted: var(--text-muted);
}
`;

content = content.replace(rootRegex, newRoot + "\n\n");
content = content.replace(lightRegex, newLight);

// Also remove font URL entirely and put the new one at the top? Wait, the user said "Inter or Geist font". The existing one is Inter. We can leave the import.

fs.writeFileSync(file, content, 'utf8');
