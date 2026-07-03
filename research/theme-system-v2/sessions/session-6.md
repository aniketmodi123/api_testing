# Session 6 — Custom Theme Editor

**Goal:** Add a "Custom" tab to ThemePanel with a live color editor. User can modify individual color tokens, see a live preview, name the theme, and save it. Saving persists to localStorage in this session; backend persistence is Session 7.

**Prerequisites:** Session 5 complete (6-tab ThemePanel working).

---

## Design Spec

### Where it lives
A 7th tab in ThemePanel: "Custom". Available to all users.

```
TABS                  CUSTOM EDITOR
─────────────────────────────────────────────────────
Color                 ┌─ Base theme  [Mid Dark ▼] ───┐
Font                  │  Start from an existing theme │
Spacing               └──────────────────────────────┘
Radius
Shadow                ┌─ SURFACES ────────────────────┐
Motion                │  Page background    [■ #16181d]│
─────                 │  Panel              [■ #1a1d24]│
● Custom              │  Card               [■ #20242d]│
                      └──────────────────────────────┘

                      ┌─ ACCENT ──────────────────────┐
                      │  Primary accent     [■ #748ffc]│
                      │  (auto-derives hover + dim)    │
                      └──────────────────────────────┘

                      ┌─ TEXT ────────────────────────┐
                      │  Body text  [■] 11.2:1 ✓      │
                      │  Muted text [■] 4.6:1 ✓       │
                      └──────────────────────────────┘

                      ┌─ STATUS ──────────────────────┐
                      │  Success  [■]  Warning [■]     │
                      │  Error    [■]  Info    [■]     │
                      └──────────────────────────────┘

                      ┌─ SAVE ────────────────────────┐
                      │  Theme name: [_____________]   │
                      │  [Save]  [Export JSON]         │
                      └──────────────────────────────┘
```

### Interaction
- Selecting a base theme pre-fills all values
- Each color picker maps directly to a CSS var
- Text fields show live contrast ratio (calculated in JS — no library needed)
- Preview pane on the RIGHT updates live (same as other tabs — uses `applyPresetToElement`)
- Save → stores to localStorage under key `polaris-custom-themes` as array of `{ name, token_map }`
- Activating a custom theme applies its token_map on top of the current preset

---

## Task 1: Create `CustomThemeEditor.jsx`

New file: `frontend/src/components/ThemePanel/CustomThemeEditor.jsx`

```jsx
import { useCallback, useEffect, useState } from 'react';
import { THEME_PRESETS } from '../../themes/presets/themes.js';
import { THEME_META } from '../../themes/index.js';
import styles from './CustomThemeEditor.module.css';

// Contrast ratio calc — no library needed
function relativeLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return ((lighter + 0.05) / (darker + 0.05)).toFixed(1);
}

const EDITABLE_TOKENS = [
  {
    group: 'Surfaces',
    tokens: [
      { key: '--bg', label: 'Page background' },
      { key: '--surface-1', label: 'Panel' },
      { key: '--surface-2', label: 'Card / Input' },
      { key: '--surface-3', label: 'Hover fill' },
      { key: '--border', label: 'Border' },
    ],
  },
  {
    group: 'Accent',
    tokens: [
      { key: '--accent', label: 'Primary accent', hint: 'Auto-derives hover and dim' },
    ],
  },
  {
    group: 'Text',
    tokens: [
      { key: '--text', label: 'Body text', contrastAgainst: '--bg' },
      { key: '--text-muted', label: 'Muted text', contrastAgainst: '--bg' },
    ],
  },
  {
    group: 'Status',
    tokens: [
      { key: '--success', label: 'Success' },
      { key: '--warning', label: 'Warning' },
      { key: '--error', label: 'Error' },
      { key: '--info', label: 'Info' },
    ],
  },
];

// Load custom themes from localStorage
function loadCustomThemes() {
  try {
    const stored = localStorage.getItem('polaris-custom-themes');
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveCustomThemes(themes) {
  try {
    localStorage.setItem('polaris-custom-themes', JSON.stringify(themes));
  } catch {}
}

export default function CustomThemeEditor({ preferences, onPreviewChange, onActivate }) {
  const [baseTheme, setBaseTheme] = useState(preferences.theme);
  const [overrides, setOverrides] = useState(() => ({ ...THEME_PRESETS[preferences.theme] }));
  const [themeName, setThemeName] = useState('My Theme');

  // Merge base + overrides whenever base changes
  useEffect(() => {
    setOverrides({ ...THEME_PRESETS[baseTheme] });
  }, [baseTheme]);

  // Notify parent to update live preview
  useEffect(() => {
    onPreviewChange(overrides);
  }, [overrides, onPreviewChange]);

  const handleColorChange = useCallback((key, value) => {
    setOverrides(prev => {
      const next = { ...prev, [key]: value };

      // Auto-derive accent variants
      if (key === '--accent') {
        next['--btn-primary-bg'] = value;
        next['--border-focus'] = value;
        next['--input-focus-border'] = value;
        next['--sidebar-icon-active'] = value;
        // accent-dim: 10% opacity version
        const hex = value.replace('#', '');
        const r = parseInt(hex.slice(0,2), 16);
        const g = parseInt(hex.slice(2,4), 16);
        const b = parseInt(hex.slice(4,6), 16);
        next['--accent-dim'] = `rgba(${r}, ${g}, ${b}, 0.1)`;
      }

      return next;
    });
  }, []);

  const handleSave = useCallback(() => {
    const themes = loadCustomThemes();
    const existing = themes.findIndex(t => t.name === themeName);
    const entry = { name: themeName, token_map: overrides, created_at: new Date().toISOString() };
    if (existing >= 0) themes[existing] = entry;
    else themes.push(entry);
    saveCustomThemes(themes);
    onActivate(themeName, overrides);
  }, [themeName, overrides, onActivate]);

  const handleExport = useCallback(() => {
    const json = JSON.stringify({ name: themeName, token_map: overrides }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `polaris-theme-${themeName.toLowerCase().replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [themeName, overrides]);

  return (
    <div className={styles.editor}>
      {/* Base theme selector */}
      <div className={styles.section}>
        <label className={styles.sectionLabel}>Start from</label>
        <select
          className={styles.baseSelect}
          value={baseTheme}
          onChange={e => setBaseTheme(e.target.value)}
        >
          {THEME_META.map(t => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Token groups */}
      {EDITABLE_TOKENS.map(group => (
        <div key={group.group} className={styles.section}>
          <div className={styles.sectionLabel}>{group.group}</div>
          {group.tokens.map(token => {
            const value = overrides[token.key] || '#000000';
            // Only show contrast if value is a valid hex
            const isHex = /^#[0-9a-fA-F]{6}$/.test(value);
            const bgHex = token.contrastAgainst ? overrides[token.contrastAgainst] : null;
            const isValidBg = bgHex && /^#[0-9a-fA-F]{6}$/.test(bgHex);
            const ratio = isHex && isValidBg ? contrastRatio(value, bgHex) : null;
            const passAA = ratio && parseFloat(ratio) >= 4.5;

            return (
              <div key={token.key} className={styles.tokenRow}>
                <input
                  type="color"
                  className={styles.colorPicker}
                  value={isHex ? value : '#000000'}
                  onChange={e => handleColorChange(token.key, e.target.value)}
                />
                <div className={styles.tokenInfo}>
                  <span className={styles.tokenLabel}>{token.label}</span>
                  {token.hint && <span className={styles.tokenHint}>{token.hint}</span>}
                </div>
                {ratio && (
                  <span className={`${styles.contrastBadge} ${passAA ? styles.pass : styles.fail}`}>
                    {ratio}:1 {passAA ? '✓' : '✗'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* Save */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>Save</div>
        <input
          className={styles.nameInput}
          value={themeName}
          onChange={e => setThemeName(e.target.value)}
          placeholder="Theme name"
          maxLength={40}
        />
        <div className={styles.saveActions}>
          <button className={styles.saveBtn} onClick={handleSave}>Save theme</button>
          <button className={styles.exportBtn} onClick={handleExport}>Export JSON</button>
        </div>
      </div>
    </div>
  );
}
```

---

## Task 2: Create `CustomThemeEditor.module.css`

```css
.editor {
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow-y: auto;
  height: 100%;
  padding: 8px;
}

.section {
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.section:last-child {
  border-bottom: none;
}

.sectionLabel {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 6px;
}

.baseSelect {
  width: 100%;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  color: var(--text);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  font-size: var(--text-sm);
  cursor: pointer;
}

.tokenRow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
}

.colorPicker {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  background: none;
}
.colorPicker::-webkit-color-swatch-wrapper { padding: 0; }
.colorPicker::-webkit-color-swatch { border: 1px solid var(--border); border-radius: 3px; }

.tokenInfo {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.tokenLabel {
  font-size: var(--text-sm);
  color: var(--text);
}
.tokenHint {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.contrastBadge {
  font-size: 9px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 3px;
  flex-shrink: 0;
}
.pass { background: var(--badge-success-bg); color: var(--badge-success-text); }
.fail { background: var(--badge-error-bg); color: var(--badge-error-text); }

.nameInput {
  width: 100%;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  color: var(--text);
  border-radius: var(--radius-sm);
  padding: 5px 8px;
  font-size: var(--text-sm);
  margin-bottom: 6px;
}
.nameInput:focus {
  outline: none;
  border-color: var(--input-focus-border);
}

.saveActions {
  display: flex;
  gap: 6px;
}
.saveBtn {
  flex: 1;
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  border: none;
  border-radius: var(--radius-sm);
  padding: 6px;
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: background var(--duration-fast) var(--easing-default);
}
.saveBtn:hover { background: var(--btn-primary-hover); }
.exportBtn {
  background: var(--btn-secondary-bg);
  color: var(--text);
  border: 1px solid var(--btn-secondary-border);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  font-size: var(--text-sm);
  cursor: pointer;
}
```

---

## Task 3: Wire into ThemePanel

In `ThemePanel.jsx`, add a 7th entry to `TABS`:
```js
{ id: 'custom', label: 'Custom', prefKey: null, meta: [] }
```

In the tab content render section, add special handling for `activeTab === 'custom'`:
```jsx
{activeTab === 'custom' && (
  <CustomThemeEditor
    preferences={preferences}
    onPreviewChange={(tokenMap) => {
      // Apply directly to preview element
      if (previewRef.current) {
        for (const [k, v] of Object.entries(tokenMap)) {
          previewRef.current.style.setProperty(k, v);
        }
      }
    }}
    onActivate={(name, tokenMap) => {
      // Apply to :root
      for (const [k, v] of Object.entries(tokenMap)) {
        document.documentElement.style.setProperty(k, v);
      }
      // Store active custom theme name in preferences
      setPreference('customTheme', name);
    }}
  />
)}
```

---

## Task 4: Import custom theme on load

In `ThemeContext.jsx`, after `applyPreset(preferences)` on mount, check if a custom theme is stored:
```js
const customThemes = JSON.parse(localStorage.getItem('polaris-custom-themes') || '[]');
const activeName = preferences.customTheme;
if (activeName) {
  const customTheme = customThemes.find(t => t.name === activeName);
  if (customTheme) {
    for (const [k, v] of Object.entries(customTheme.token_map)) {
      document.documentElement.style.setProperty(k, v);
    }
  }
}
```

---

## Acceptance Criteria

- [ ] ThemePanel has "Custom" tab as 7th tab
- [ ] Clicking Custom tab shows the editor form
- [ ] Changing Page background color → preview pane bg updates live
- [ ] Changing accent → btn-primary-bg, border-focus, accent-dim all auto-update
- [ ] Text fields show contrast ratio with ✓/✗ badge (4.5:1 threshold)
- [ ] Save → reloading the page restores the custom theme
- [ ] Export → downloads a valid JSON file
- [ ] Build passes clean
