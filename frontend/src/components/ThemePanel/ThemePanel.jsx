import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiActivity, FiAlignJustify, FiAperture, FiCheck, FiCode, FiDroplet, FiEye,
  FiLayers, FiPlus, FiSliders, FiSquare, FiTerminal, FiType, FiX,
} from 'react-icons/fi';
import {
  applyPresetToElement,
  THEME_META, ACCENT_META, FONT_META, CODE_FONT_META,
  SPACING_META, RADIUS_META, SHADOW_META, MOTION_META, EDITOR_META, A11Y_META,
} from '../../themes/index.js';
import { MARKETPLACE_THEMES } from '../../data/marketplaceThemes.js';
import { loadCustomThemes, saveCustomThemes } from '../../themes/customTheme.js';
import { useTheme } from '../ThemeContext.jsx';
import CustomThemeEditor from './CustomThemeEditor.jsx';
import styles from './ThemePanel.module.css';

// Left-nav axes, in rail order. `prefKey` is the ThemeContext preference each tab edits;
// `meta` is the option list rendered as cards on that tab. `custom` is rendered separately
// below the divider — it has no prefKey/meta (free-form token editor).
const TABS = [
  { id: 'colors', label: 'Color theme', icon: <FiDroplet />, prefKey: 'theme', meta: THEME_META },
  { id: 'accent', label: 'Accent', icon: <FiAperture />, prefKey: 'accent', meta: ACCENT_META },
  { id: 'font', label: 'Typography', icon: <FiType />, prefKey: 'font', meta: FONT_META },
  { id: 'codeFont', label: 'Code font', icon: <FiCode />, prefKey: 'codeFont', meta: CODE_FONT_META },
  { id: 'spacing', label: 'Density', icon: <FiAlignJustify />, prefKey: 'spacing', meta: SPACING_META },
  { id: 'radius', label: 'Radius', icon: <FiSquare />, prefKey: 'radius', meta: RADIUS_META },
  { id: 'shadow', label: 'Shadow', icon: <FiLayers />, prefKey: 'shadow', meta: SHADOW_META },
  { id: 'motion', label: 'Motion', icon: <FiActivity />, prefKey: 'motion', meta: MOTION_META },
  { id: 'editor', label: 'Code editor', icon: <FiTerminal />, prefKey: 'editor', meta: EDITOR_META },
  { id: 'a11y', label: 'Accessibility', icon: <FiEye />, prefKey: 'a11y', meta: A11Y_META },
];

// Mini API-workspace mockup — renders entirely from CSS vars set on its parent element,
// so it doubles as a live exercise of color, accent, fonts, density, radius, shadow,
// motion, and syntax theme all at once.
function PreviewMockup() {
  return (
    <div className={styles.mockup}>
      <div className={styles.mockupSidebar}>
        <div className={styles.mockupSidebarTitle}>Users API</div>
        <div className={styles.mockupSidebarItemActive}>
          <span className={styles.mockupMethodGet}>GET</span>
          <span className={styles.mockupSidebarPath}>/users</span>
        </div>
        <div className={styles.mockupSidebarItem}>
          <span className={styles.mockupMethodPost}>POST</span>
          <span className={styles.mockupSidebarPath}>/users</span>
        </div>
        <div className={styles.mockupSidebarItem}>
          <span className={styles.mockupMethodPut}>PUT</span>
          <span className={styles.mockupSidebarPath}>/users/:id</span>
        </div>
        <div className={styles.mockupSidebarItem}>
          <span className={styles.mockupMethodDelete}>DEL</span>
          <span className={styles.mockupSidebarPath}>/users/:id</span>
        </div>
      </div>
      <div className={styles.mockupMain}>
        <div className={styles.mockupUrlBar}>
          <span className={styles.mockupMethodGet}>GET</span>
          <div className={styles.mockupUrl}>api.acme.dev/v1/users?limit=20</div>
          <div className={styles.mockupSendBtn}>Send</div>
        </div>
        <div className={styles.mockupTabsRow}>
          <span className={styles.mockupBodyTabActive}>Body</span>
          <span className={styles.mockupBodyTab}>Headers</span>
          <span className={styles.mockupBodyTab}>Auth</span>
        </div>
        <div className={styles.mockupCodeBlock}>
          <div><span className={styles.mockupJsonPunct}>{'{'}</span></div>
          <div className={styles.mockupJsonRow}>
            <span className={styles.mockupJsonKey}>&quot;role&quot;</span>
            <span className={styles.mockupJsonPunct}>: </span>
            <span className={styles.mockupJsonString}>&quot;admin&quot;</span>
            <span className={styles.mockupJsonPunct}>,</span>
          </div>
          <div className={styles.mockupJsonRow}>
            <span className={styles.mockupJsonKey}>&quot;active&quot;</span>
            <span className={styles.mockupJsonPunct}>: </span>
            <span className={styles.mockupJsonBoolean}>true</span>
            <span className={styles.mockupJsonPunct}>,</span>
          </div>
          <div className={styles.mockupJsonRow}>
            <span className={styles.mockupJsonKey}>&quot;limit&quot;</span>
            <span className={styles.mockupJsonPunct}>: </span>
            <span className={styles.mockupJsonNumber}>20</span>
          </div>
          <div><span className={styles.mockupJsonPunct}>{'}'}</span></div>
        </div>
        <div className={styles.mockupStatusRow}>
          <span className={styles.mockupStatusBadge}>200 OK</span>
          <span className={styles.mockupStatusMeta}>124ms · 1.2kb</span>
          <div className={styles.mockupBadgeRow}>
            <span className={styles.mockupBadgeSuccess}>Pass</span>
            <span className={styles.mockupBadgeError}>Fail</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Three-square swatch + label theme card (used for both built-in themes and community presets).
function ThemeCardFig({ swatches, label, sub, subAccent, active, onSelect, onHover }) {
  return (
    <button
      type="button"
      className={`${styles.themeCard} ${active ? styles.themeCardActive : ''}`}
      onClick={onSelect}
      onMouseEnter={onHover}
      onMouseLeave={() => onHover?.(null)}
    >
      <div className={styles.themeSwatches}>
        {swatches.map((s, i) => (
          <span key={i} className={styles.themeSw} style={{ background: s.bg, border: s.border ? `1px solid ${s.border}` : 'none' }} />
        ))}
      </div>
      <div className={styles.themeName}>{label}</div>
      <div className={styles.themeSub} style={subAccent ? { color: 'var(--accent)' } : undefined}>
        {sub}{active ? ' · active' : ''}
      </div>
    </button>
  );
}

// === Per-tab swatch renderers (generic option grid on non-color tabs) ===

function renderAccentSwatch(item) {
  if (item.id === 'default') {
    return <div className={styles.accentSwatch} aria-hidden="true"><span className={styles.accentRing} /></div>;
  }
  return (
    <div className={styles.accentSwatch}>
      <span className={styles.accentDot} style={{ background: item.swatch }} />
    </div>
  );
}

function renderFontSwatch(item) {
  return <div className={styles.fontSample} style={{ fontFamily: item.fontFamily }}>Aa</div>;
}

function renderCodeFontSwatch(item) {
  return <div className={styles.fontSample} style={{ fontFamily: item.fontFamily }}>{item.sample}</div>;
}

function renderSpacingSwatch(item) {
  const gaps = { compact: 2, default: 4, comfortable: 7 };
  return (
    <div className={styles.spacingSwatch} style={{ gap: gaps[item.id] ?? 4 }}>
      <span className={styles.spacingBar} />
      <span className={styles.spacingBar} />
      <span className={styles.spacingBar} />
    </div>
  );
}

function renderRadiusSwatch(item) {
  const radii = { sharp: 2, default: 8, rounded: 16 };
  return (
    <div className={styles.radiusSwatch}>
      <span className={styles.radiusBox} style={{ borderRadius: radii[item.id] ?? 8 }} />
    </div>
  );
}

function renderShadowSwatch(item) {
  const depths = { flat: styles.shadowCardFlat, default: styles.shadowCardSm, elevated: styles.shadowCardLg };
  return (
    <div className={styles.shadowSwatch}>
      <span className={`${styles.shadowCard} ${depths[item.id] ?? ''}`} />
    </div>
  );
}

function renderMotionSwatch(item) {
  const glyphs = { none: '◎', subtle: '∿', full: '⚡' };
  return (
    <div className={styles.motionChip}>
      <span className={styles.motionGlyph}>{glyphs[item.id] ?? '∿'}</span>
    </div>
  );
}

function renderEditorSwatch(item) {
  return (
    <div className={styles.editorSwatch} style={{ background: item.preview.bg }}>
      <span className={styles.editorLine} style={{ background: item.preview.key, width: '70%' }} />
      <span className={styles.editorLine} style={{ background: item.preview.string, width: '50%' }} />
      <span className={styles.editorLine} style={{ background: item.preview.number, width: '60%' }} />
    </div>
  );
}

function renderA11ySwatch(item) {
  return <div className={styles.a11yChip}>{item.label}</div>;
}

const SWATCH_RENDERERS = {
  accent: renderAccentSwatch,
  font: renderFontSwatch,
  codeFont: renderCodeFontSwatch,
  spacing: renderSpacingSwatch,
  radius: renderRadiusSwatch,
  shadow: renderShadowSwatch,
  motion: renderMotionSwatch,
  editor: renderEditorSwatch,
  a11y: renderA11ySwatch,
};

function OptionCard({ item, isActive, onSelect, onHover, renderSwatch }) {
  return (
    <button
      type="button"
      className={`${styles.card} ${isActive ? styles.cardActive : ''}`}
      onClick={() => onSelect(item.id)}
      onMouseEnter={() => onHover(item.id)}
      onMouseLeave={() => onHover(null)}
    >
      {renderSwatch ? renderSwatch(item) : null}
      <div className={styles.cardMeta}>
        <span className={styles.cardLabel}>{item.label}</span>
        <span className={styles.cardDesc}>{item.description}</span>
      </div>
      {isActive && <FiCheck className={styles.cardCheck} />}
    </button>
  );
}

export default function ThemePanel({ onClose }) {
  const { preferences, setPreference, setActiveServerTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('colors');
  const [hoveredId, setHoveredId] = useState(null);
  const previewRef = useRef(null);
  const panelRef = useRef(null);

  const activeTabDef = TABS.find((t) => t.id === activeTab);

  // While hovering a prefKey-backed option, scope the preview to that option without
  // committing it. Marketplace presets / custom tab don't drive hover (token-map overlay).
  const previewPrefs = useMemo(() => {
    if (hoveredId && activeTabDef?.prefKey) {
      return { ...preferences, [activeTabDef.prefKey]: hoveredId };
    }
    return preferences;
  }, [hoveredId, activeTabDef, preferences]);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    applyPresetToElement(el, previewPrefs);
    // Mirror the active community/custom override onto the preview so it matches :root.
    if (!hoveredId && preferences.customTheme) {
      const ct = loadCustomThemes().find((t) => t.name === preferences.customTheme);
      if (ct) for (const [k, v] of Object.entries(ct.token_map)) el.style.setProperty(k, v);
    }
  }, [previewPrefs, hoveredId, preferences.customTheme]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Select a built-in theme — clears any active community/custom override so the base
  // preset shows through cleanly (ThemeContext re-overlays customTheme otherwise).
  const selectBuiltinTheme = useCallback((id) => {
    setActiveServerTheme(null);
    setPreference('customTheme', null);
    setPreference('theme', id);
  }, [setActiveServerTheme, setPreference]);

  // Apply a community preset — writes its token_map to :root for instant feedback, then
  // persists it as a named custom theme (same store the Custom tab reads), so it survives
  // reload and the ThemeContext overlay re-applies it on later preference changes.
  const applyCommunityPreset = useCallback((theme) => {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(theme.token_map)) root.style.setProperty(k, v);

    const themes = loadCustomThemes();
    const idx = themes.findIndex((t) => t.name === theme.name);
    const entry = { name: theme.name, token_map: theme.token_map, created_at: new Date().toISOString() };
    if (idx >= 0) themes[idx] = entry; else themes.push(entry);
    saveCustomThemes(themes);

    setActiveServerTheme(null);
    setPreference('customTheme', theme.name);
  }, [setActiveServerTheme, setPreference]);

  const handleSelect = useCallback((value) => {
    if (activeTabDef?.prefKey) setPreference(activeTabDef.prefKey, value);
  }, [activeTabDef, setPreference]);

  const handleTabChange = useCallback((tabId) => {
    setActiveTab(tabId);
    setHoveredId(null);
  }, []);

  const renderSwatch = activeTabDef ? SWATCH_RENDERERS[activeTabDef.id] : null;
  // A built-in theme is "active" only when no community/custom override is layered on top.
  const builtinActive = !preferences.customTheme;

  return (
    <div className={styles.panel} ref={panelRef}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>Appearance</span>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <FiX />
        </button>
      </div>

      <div className={styles.panelBody}>
        {/* Left nav */}
        <nav className={styles.nav}>
          <div className={styles.navLabel}>CUSTOMIZE</div>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`${styles.navItem} ${activeTab === tab.id ? styles.navItemActive : ''}`}
              onClick={() => handleTabChange(tab.id)}
            >
              <span className={styles.navIcon}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
          <div className={styles.navDivider} />
          <button
            type="button"
            className={`${styles.navItem} ${activeTab === 'custom' ? styles.navItemActive : ''}`}
            onClick={() => handleTabChange('custom')}
          >
            <span className={styles.navIcon}><FiSliders /></span>
            Custom editor
          </button>
        </nav>

        {/* Content: scrollable controls + pinned live preview */}
        <div className={styles.content}>
          <div className={styles.contentScroll}>
            {activeTab === 'colors' && (
              <>
                <div className={styles.panelTitle2}>Color theme</div>
                <div className={styles.panelSub}>Each preset ships its own personality. Accent isn&apos;t forced across themes.</div>

                <div className={styles.themeGrid}>
                  {THEME_META.map((t) => (
                    <ThemeCardFig
                      key={t.id}
                      swatches={[
                        { bg: t.preview.bg, border: t.preview.border },
                        { bg: t.preview.surface },
                        { bg: t.preview.accent },
                      ]}
                      label={t.label}
                      sub={t.description}
                      active={builtinActive && preferences.theme === t.id}
                      subAccent={builtinActive && preferences.theme === t.id}
                      onSelect={() => selectBuiltinTheme(t.id)}
                    />
                  ))}
                  <button type="button" className={styles.themeCardAdd} onClick={() => handleTabChange('custom')}>
                    <FiPlus /> Custom
                  </button>
                </div>

                <div className={styles.groupLabel}>Community themes</div>
                <div className={styles.themeGrid}>
                  {MARKETPLACE_THEMES.map((m) => (
                    <ThemeCardFig
                      key={m.id}
                      swatches={[{ bg: m.palette[0] }, { bg: m.palette[1] }, { bg: m.palette[2] }]}
                      label={m.name}
                      sub={m.tag}
                      active={preferences.customTheme === m.name}
                      subAccent={preferences.customTheme === m.name}
                      onSelect={() => applyCommunityPreset(m)}
                    />
                  ))}
                </div>

              </>
            )}

            {activeTab === 'custom' && (
              <CustomThemeEditor
                preferences={preferences}
                onPreviewChange={(tokenMap) => {
                  const el = previewRef.current;
                  if (el) for (const [k, v] of Object.entries(tokenMap)) el.style.setProperty(k, v);
                }}
                onActivate={(name, tokenMap) => {
                  for (const [k, v] of Object.entries(tokenMap)) {
                    document.documentElement.style.setProperty(k, v);
                  }
                  setActiveServerTheme(null);
                  setPreference('customTheme', name);
                }}
              />
            )}

            {activeTab !== 'colors' && activeTab !== 'custom' && (
              <>
                <div className={styles.panelTitle2}>{activeTabDef.label}</div>
                <div className={styles.grid}>
                  {activeTabDef.meta.map((item) => (
                    <OptionCard
                      key={item.id}
                      item={item}
                      isActive={preferences[activeTabDef.prefKey] === item.id}
                      onSelect={handleSelect}
                      onHover={setHoveredId}
                      renderSwatch={renderSwatch}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Pinned live preview — always visible on every tab */}
          <div className={styles.previewRegion}>
            <div className={styles.previewHead}>
              <span className={styles.previewDot} />
              <span className={styles.previewLabel}>Live preview</span>
            </div>
            <div className={styles.previewBox} ref={previewRef}>
              <PreviewMockup />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
