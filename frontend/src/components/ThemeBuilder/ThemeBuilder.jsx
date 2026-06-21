import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiCheck, FiCode, FiCopy, FiDownload, FiRotateCcw, FiShare2, FiSliders, FiX,
} from 'react-icons/fi';
import {
  applyPreset, THEME_PRESETS, THEME_META, RADIUS_META, SPACING_META,
} from '../../themes/index.js';
import { RADIUS_PRESETS } from '../../themes/presets/radius.js';
import { SPACING_PRESETS } from '../../themes/presets/spacing.js';
import { deriveAccent, isHex, loadCustomThemes, saveCustomThemes, exportThemeJson } from '../../themes/customTheme.js';
import styles from './ThemeBuilder.module.css';

// Token rows editable in the builder — same keys as the Custom tab (Phase E) plus the
// extra surface/text rows the Figma mockup calls for (8.4: Surfaces / Borders & text / Accent).
const TOKEN_GROUPS = [
  {
    group: 'Surfaces',
    tokens: [
      { key: '--surface-1', label: 'surface-primary' },
      { key: '--surface-2', label: 'surface-secondary' },
      { key: '--surface-3', label: 'surface-elevated' },
    ],
  },
  {
    group: 'Borders & text',
    tokens: [
      { key: '--border', label: 'border-default' },
      { key: '--text', label: 'text-primary' },
      { key: '--text-subtle', label: 'text-secondary' },
    ],
  },
  {
    group: 'Accent',
    tokens: [
      { key: '--accent', label: 'accent-primary', highlight: true },
    ],
  },
];

// Radius/spacing sliders are 3-step (index 0/1/2) mapping onto the same preset ladders
// the Appearance panel uses, so a builder edit is a real, reusable preset — not a
// one-off scalar that drifts from RADIUS_PRESETS/SPACING_PRESETS.
const RADIUS_STEPS = RADIUS_META.map((m) => m.id); // ['sharp', 'default', 'rounded']
const SPACING_STEPS = SPACING_META.map((m) => m.id); // ['compact', 'default', 'comfortable']

function stepIndex(steps, id) {
  const idx = steps.indexOf(id);
  return idx === -1 ? 1 : idx; // fall back to the middle ("default") step
}

// Builder's overrides object carries full token maps (color + radius + spacing all
// merged together), so detecting "is this theme using the rounded radius preset"
// means checking whether its --radius value matches that preset's --radius value.
function presetStepFromOverrides(presets, steps, overrides, sampleKey) {
  const current = overrides[sampleKey];
  const matched = steps.find((id) => presets[id]?.[sampleKey] === current);
  return matched ? stepIndex(steps, matched) : 1;
}

// Build the theme.json preview object: only the keys the draft actually changed vs the
// base preset, plus the typography/codeFont/editor axes carried from the committed
// preferences (the builder edits color/radius/spacing tokens; it doesn't expose its own
// font pickers, so theme.json reports what's currently active for those axes).
function buildThemeJson(name, baseTheme, overrides, preferences) {
  const basePreset = THEME_PRESETS[baseTheme] ?? THEME_PRESETS.dark;
  const tokens = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (basePreset[key] !== value) tokens[key] = value;
  }
  return {
    name,
    extends: baseTheme,
    tokens,
    typography: preferences.font,
    codeFont: preferences.codeFont,
    editor: preferences.editor,
  };
}

// Hand-rolled syntax highlighter for the theme.json preview pane — mirrors the mockup's
// Tokyo-Night-style coloring using the live --viz-json-* tokens (so the JSON view itself
// re-colors when the active syntax theme changes, same as every other JSON view in the app).
function ThemeJsonView({ json }) {
  const lines = [];
  lines.push(<div key="open"><span className={styles.punct}>{'{'}</span></div>);

  const pushKV = (depth, key, valueNode, comma) => (
    <div key={`${depth}-${key}`} style={{ paddingLeft: depth * 10 }}>
      <span className={styles.jsonKey}>&quot;{key}&quot;</span>
      <span className={styles.punct}>: </span>
      {valueNode}
      {comma && <span className={styles.punct}>,</span>}
    </div>
  );

  lines.push(pushKV(1, 'name', <span className={styles.jsonString}>&quot;{json.name}&quot;</span>, true));
  lines.push(pushKV(1, 'extends', <span className={styles.jsonString}>&quot;{json.extends}&quot;</span>, true));

  const tokenKeys = Object.keys(json.tokens);
  lines.push(
    <div key="tokens-open" style={{ paddingLeft: 10 }}>
      <span className={styles.jsonKey}>&quot;tokens&quot;</span>
      <span className={styles.punct}>: {'{'}</span>
    </div>,
  );
  if (tokenKeys.length === 0) {
    lines.push(<div key="tokens-empty" style={{ paddingLeft: 20 }}><span className={styles.muted}>// no overrides yet</span></div>);
  } else {
    tokenKeys.forEach((key, i) => {
      const value = json.tokens[key];
      const isNumeric = /^-?\d+(\.\d+)?(px|rem|ms)?$/.test(String(value));
      const valueNode = isNumeric
        ? <span className={styles.jsonNumber}>{value}</span>
        : <span className={styles.jsonString}>&quot;{value}&quot;</span>;
      lines.push(
        <div key={`tok-${key}`} style={{ paddingLeft: 20 }}>
          <span className={styles.jsonKey}>&quot;{key}&quot;</span>
          <span className={styles.punct}>: </span>
          {valueNode}
          {i < tokenKeys.length - 1 && <span className={styles.punct}>,</span>}
        </div>,
      );
    });
  }
  lines.push(<div key="tokens-close" style={{ paddingLeft: 10 }}><span className={styles.punct}>{'}'},</span></div>);

  lines.push(pushKV(1, 'typography', <span className={styles.jsonString}>&quot;{json.typography}&quot;</span>, true));
  lines.push(pushKV(1, 'codeFont', <span className={styles.jsonString}>&quot;{json.codeFont}&quot;</span>, true));
  lines.push(pushKV(1, 'editor', <span className={styles.jsonString}>&quot;{json.editor}&quot;</span>, false));

  lines.push(<div key="close"><span className={styles.punct}>{'}'}</span></div>);
  return <div className={styles.jsonBody}>{lines}</div>;
}

export default function ThemeBuilder({ preferences, setPreference, onClose }) {
  const [baseTheme, setBaseTheme] = useState(preferences.theme);
  const [overrides, setOverrides] = useState(() => ({ ...(THEME_PRESETS[preferences.theme] ?? THEME_PRESETS.dark) }));
  const [name, setName] = useState('My Theme');
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [saved, setSaved] = useState(false);

  // Live-apply choice (spec asks us to pick one and document it): this is a dedicated
  // full-screen tool, not an inline panel layered over other live UI, so we write
  // straight to :root via applyPreset() — the builder chrome restyles along with the
  // rest of the app, which is also what lets token rows show their *real* on-screen
  // effect instead of a scoped approximation. The tradeoff: edits are visible globally
  // while drafting, even before "Save". We accept that because (a) nothing persists
  // until Save explicitly writes to storage/backend, and (b) on unmount we restore the
  // originally-committed preferences below, so navigating away without saving leaves
  // no residue.
  useEffect(() => {
    applyPreset({ ...preferences, theme: baseTheme }, overrides);
  }, [baseTheme, overrides, preferences]);

  // Restore the latest *committed* theme on unmount (covers close, Escape, and route
  // changes) so a draft that was never saved doesn't leak into the live app. Read from a
  // ref (kept fresh below) rather than closing over `preferences` directly — Save commits
  // a new customTheme mid-session via setPreference(), and a `[]`-deps cleanup closure
  // would otherwise still see the pre-session value, reverting a just-saved theme on close.
  const preferencesRef = useRef(preferences);
  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  useEffect(() => {
    return () => {
      const committed = preferencesRef.current;
      applyPreset(committed);
      if (committed.customTheme) {
        const customTheme = loadCustomThemes().find((t) => t.name === committed.customTheme);
        if (customTheme) {
          const root = document.documentElement;
          for (const [k, v] of Object.entries(customTheme.token_map)) root.style.setProperty(k, v);
        }
      }
    };
  }, []);

  // Switching base theme resets the draft to that preset (mirrors CustomThemeEditor).
  useEffect(() => {
    setOverrides({ ...(THEME_PRESETS[baseTheme] ?? THEME_PRESETS.dark) });
  }, [baseTheme]);

  // Close on Escape, matching ConfirmModal's keyboard contract.
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleTokenChange = useCallback((key, value) => {
    setOverrides((prev) => {
      const next = { ...prev, [key]: value };
      if (key === '--accent') Object.assign(next, deriveAccent(value));
      return next;
    });
  }, []);

  const radiusStep = useMemo(
    () => presetStepFromOverrides(RADIUS_PRESETS, RADIUS_STEPS, overrides, '--radius'),
    [overrides],
  );
  const spacingStep = useMemo(
    () => presetStepFromOverrides(SPACING_PRESETS, SPACING_STEPS, overrides, '--space-1'),
    [overrides],
  );

  const handleRadiusSlider = useCallback((e) => {
    const id = RADIUS_STEPS[Number(e.target.value)];
    setOverrides((prev) => ({ ...prev, ...RADIUS_PRESETS[id] }));
  }, []);

  const handleSpacingSlider = useCallback((e) => {
    const id = SPACING_STEPS[Number(e.target.value)];
    setOverrides((prev) => ({ ...prev, ...SPACING_PRESETS[id] }));
  }, []);

  const themeJson = useMemo(
    () => buildThemeJson(name, baseTheme, overrides, preferences),
    [name, baseTheme, overrides, preferences],
  );

  const handleDuplicate = useCallback(() => {
    // Rename the working draft so the next Save persists a distinct entry instead of
    // overwriting the original — guard against " copy" stacking on repeated clicks.
    setName((prev) => (prev.endsWith(' copy') ? prev : `${prev} copy`));
  }, []);

  const handleReset = useCallback(() => {
    setOverrides({ ...(THEME_PRESETS[baseTheme] ?? THEME_PRESETS.dark) });
  }, [baseTheme]);

  const handleSave = useCallback(() => {
    const themes = loadCustomThemes();
    const existingIdx = themes.findIndex((t) => t.name === name);
    const entry = { name, token_map: overrides, created_at: new Date().toISOString() };
    if (existingIdx >= 0) themes[existingIdx] = entry;
    else themes.push(entry);
    saveCustomThemes(themes);
    applyPreset(preferences, overrides);
    setPreference('customTheme', name);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [name, overrides, preferences, setPreference]);

  const handleExport = useCallback(() => {
    exportThemeJson(name, overrides);
  }, [name, overrides]);

  const handleCopyJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(themeJson, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch (err) {
      console.error('Failed to copy theme.json:', err);
    }
  }, [themeJson]);

  // Share: clipboard write needs a live browser permission context to verify end-to-end
  // (the code path itself follows the same try/catch + "copied" flash used by
  // JsonEditor's CopyButton and RequestPanel's copyToClipboard).
  const handleShare = useCallback(async () => {
    try {
      const payload = btoa(JSON.stringify({ name, token_map: overrides }));
      const shareUrl = `${window.location.origin}/?t=${payload}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2000);
    } catch (err) {
      console.error('Failed to copy share link:', err);
    }
  }, [name, overrides]);

  return (
    <div className={styles.overlay}>
      <div className={styles.builder}>
        <div className={styles.header}>
          <FiSliders className={styles.headerIcon} />
          <span className={styles.headerTitle}>Theme builder</span>
          <input
            className={styles.nameInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="Theme name"
          />
          <span className={styles.draftTag}>(draft)</span>

          <div className={styles.headerActions}>
            <button type="button" className={styles.actionBtn} onClick={handleDuplicate}>
              Duplicate
            </button>
            <button type="button" className={styles.actionBtn} onClick={handleReset}>
              <FiRotateCcw className={styles.actionIcon} /> Reset
            </button>
            <button type="button" className={styles.saveBtn} onClick={handleSave}>
              {saved ? <FiCheck className={styles.actionIcon} /> : null}
              {saved ? 'Saved' : 'Save theme'}
            </button>
          </div>

          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close theme builder">
            <FiX />
          </button>
        </div>

        <div className={styles.body}>
          {/* Left: token rows + base theme select + sliders */}
          <div className={styles.left}>
            <div className={styles.baseRow}>
              <label className={styles.baseLabel} htmlFor="theme-builder-base">Start from</label>
              <select
                id="theme-builder-base"
                className={styles.baseSelect}
                value={baseTheme}
                onChange={(e) => setBaseTheme(e.target.value)}
              >
                {THEME_META.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>

            {TOKEN_GROUPS.map((group) => (
              <div key={group.group} className={styles.tokenGroup}>
                <div className={styles.groupLabel}>{group.group}</div>
                {group.tokens.map((token) => {
                  const value = overrides[token.key] || '#000000';
                  const valueIsHex = isHex(value);
                  return (
                    <div
                      key={token.key}
                      className={`${styles.tok} ${token.highlight ? styles.tokActive : ''}`}
                    >
                      <span className={styles.sw} style={{ background: valueIsHex ? value : '#000000' }} />
                      <span className={styles.nm}>{token.label}</span>
                      <span className={styles.hx}>{valueIsHex ? value.toUpperCase() : value}</span>
                      <input
                        type="color"
                        className={styles.colorPicker}
                        value={valueIsHex ? value : '#000000'}
                        onChange={(e) => handleTokenChange(token.key, e.target.value)}
                        aria-label={token.label}
                      />
                    </div>
                  );
                })}
              </div>
            ))}

            <div className={styles.sliders}>
              <div className={styles.sliderCol}>
                <div className={styles.sliderHead}>
                  <span>Radius</span>
                  <span className={styles.sliderValue}>{overrides['--radius']}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={1}
                  value={radiusStep}
                  onChange={handleRadiusSlider}
                  className={styles.slider}
                  aria-label="Radius"
                />
              </div>
              <div className={styles.sliderCol}>
                <div className={styles.sliderHead}>
                  <span>Spacing unit</span>
                  <span className={styles.sliderValue}>{overrides['--space-1']}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={1}
                  value={spacingStep}
                  onChange={handleSpacingSlider}
                  className={styles.slider}
                  aria-label="Spacing unit"
                />
              </div>
            </div>
          </div>

          {/* Right: live theme.json + export/share */}
          <div className={styles.right}>
            <div className={styles.jsonHeader}>
              <FiCode className={styles.jsonHeaderIcon} />
              <span className={styles.jsonHeaderLabel}>theme.json</span>
              <button
                type="button"
                className={styles.copyJsonBtn}
                onClick={handleCopyJson}
                title="Copy theme.json"
                aria-label="Copy theme.json"
              >
                {copiedJson ? <FiCheck /> : <FiCopy />}
              </button>
            </div>
            <div className={styles.jsonPane}>
              <ThemeJsonView json={themeJson} />
            </div>
            <div className={styles.bottomActions}>
              <button type="button" className={styles.bottomBtn} onClick={handleExport}>
                <FiDownload className={styles.actionIcon} /> Export
              </button>
              <button type="button" className={styles.bottomBtn} onClick={handleShare}>
                {copiedShare ? <FiCheck className={styles.actionIcon} /> : <FiShare2 className={styles.actionIcon} />}
                {copiedShare ? 'Copied' : 'Share'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
