import { useCallback, useEffect, useState } from 'react';
import { THEME_PRESETS, THEME_META } from '../../themes/index.js';
import {
  contrastRatio, isHex, deriveAccent, loadCustomThemes, saveCustomThemes, exportThemeJson,
} from '../../themes/customTheme.js';
import { api } from '../../api.js';
import styles from './CustomThemeEditor.module.css';

// Save a custom theme to the backend so it syncs across devices, handling the duplicate-name
// conflict by updating the existing row instead of failing. Always activates the saved theme.
// Throws on any unrecoverable error so the caller can fall back to localStorage.
async function saveThemeToBackend(name, tokenMap) {
  let themeId;
  try {
    const res = await api.post('/themes', { name, token_map: tokenMap });
    themeId = res.data.data.id;
  } catch (err) {
    if (err?.response?.status === 409) {
      const listRes = await api.get('/themes');
      const existing = listRes.data.data.themes.find((t) => t.name === name);
      if (!existing) throw err;
      await api.put(`/themes/${existing.id}`, { token_map: tokenMap });
      themeId = existing.id;
    } else {
      throw err;
    }
  }
  await api.put(`/themes/${themeId}/activate`);
  return themeId;
}

// Token groups rendered as editable color-picker rows. `contrastAgainst` pairs a text
// token with the surface it sits on so we can show a live WCAG ratio badge.
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

export default function CustomThemeEditor({ preferences, onPreviewChange, onActivate }) {
  const [baseTheme, setBaseTheme] = useState(preferences.theme);
  // Same fallback as the engine's resolveTokens(): if a stored theme id has no matching
  // THEME_PRESETS entry, fall back to 'carbon' (the default) rather than silently
  // spreading undefined into an empty overrides object.
  const [overrides, setOverrides] = useState(
    () => ({ ...(THEME_PRESETS[preferences.theme] ?? THEME_PRESETS.carbon) }),
  );
  const [themeName, setThemeName] = useState('My Theme');

  // Switching the base theme resets all edits back to that preset's values.
  useEffect(() => {
    setOverrides({ ...(THEME_PRESETS[baseTheme] ?? THEME_PRESETS.carbon) });
  }, [baseTheme]);

  // Every override change drives the live preview pane (scoped element, no persist).
  useEffect(() => {
    onPreviewChange(overrides);
  }, [overrides, onPreviewChange]);

  const handleColorChange = useCallback((key, value) => {
    setOverrides((prev) => {
      const next = { ...prev, [key]: value };
      if (key === '--accent') Object.assign(next, deriveAccent(value));
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    // Always keep the localStorage copy current — it's the logged-out fallback and the
    // immediate source for onActivate's local DOM update below.
    const themes = loadCustomThemes();
    const existing = themes.findIndex((t) => t.name === themeName);
    const entry = { name: themeName, token_map: overrides, created_at: new Date().toISOString() };
    if (existing >= 0) themes[existing] = entry;
    else themes.push(entry);
    saveCustomThemes(themes);
    onActivate(themeName, overrides);

    // Best-effort sync to the backend so the theme follows the user across devices.
    // Any failure (logged out, network, 401) is swallowed — localStorage already won above.
    try {
      await saveThemeToBackend(themeName, overrides);
    } catch {
      // Logged out or network error — localStorage save above already covers this session.
    }
  }, [themeName, overrides, onActivate]);

  const handleExport = useCallback(() => {
    exportThemeJson(themeName, overrides);
  }, [themeName, overrides]);

  return (
    <div className={styles.editor}>
      {/* Base theme selector */}
      <div className={styles.section}>
        <label className={styles.sectionLabel}>Start from</label>
        <select
          className={styles.baseSelect}
          value={baseTheme}
          onChange={(e) => setBaseTheme(e.target.value)}
        >
          {THEME_META.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Token groups */}
      {EDITABLE_TOKENS.map((group) => (
        <div key={group.group} className={styles.section}>
          <div className={styles.sectionLabel}>{group.group}</div>
          {group.tokens.map((token) => {
            const value = overrides[token.key] || '#000000';
            const valueIsHex = isHex(value);
            const bgHex = token.contrastAgainst ? overrides[token.contrastAgainst] : null;
            const bgIsHex = bgHex && isHex(bgHex);
            const ratio = valueIsHex && bgIsHex ? contrastRatio(value, bgHex) : null;
            const passAA = ratio && parseFloat(ratio) >= 4.5;

            return (
              <div key={token.key} className={styles.tokenRow}>
                <input
                  type="color"
                  className={styles.colorPicker}
                  value={valueIsHex ? value : '#000000'}
                  onChange={(e) => handleColorChange(token.key, e.target.value)}
                  aria-label={token.label}
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

      {/* Save / export */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>Save</div>
        <input
          className={styles.nameInput}
          value={themeName}
          onChange={(e) => setThemeName(e.target.value)}
          placeholder="Theme name"
          maxLength={40}
        />
        <div className={styles.saveActions}>
          <button type="button" className={styles.saveBtn} onClick={handleSave}>Save theme</button>
          <button type="button" className={styles.exportBtn} onClick={handleExport}>Export JSON</button>
        </div>
      </div>
    </div>
  );
}
