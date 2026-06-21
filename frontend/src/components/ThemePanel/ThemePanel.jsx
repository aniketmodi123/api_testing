import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiCheck, FiShoppingBag, FiSliders, FiX } from 'react-icons/fi';
import {
  applyPresetToElement,
  THEME_META, ACCENT_META, FONT_META, CODE_FONT_META,
  SPACING_META, RADIUS_META, SHADOW_META, MOTION_META, EDITOR_META, A11Y_META,
} from '../../themes/index.js';
import { useTheme } from '../ThemeContext.jsx';
import CustomThemeEditor from './CustomThemeEditor.jsx';
import styles from './ThemePanel.module.css';

// 11 appearance categories, in rail order. `prefKey` is the ThemeContext preference this
// tab edits; `meta` is the option list rendered as cards. `custom` has no prefKey/meta —
// Phase E renders its own editor there.
const TABS = [
  { id: 'colors', label: 'Color', prefKey: 'theme', meta: THEME_META },
  { id: 'accent', label: 'Accent', prefKey: 'accent', meta: ACCENT_META },
  { id: 'font', label: 'Typography', prefKey: 'font', meta: FONT_META },
  { id: 'codeFont', label: 'Code font', prefKey: 'codeFont', meta: CODE_FONT_META },
  { id: 'spacing', label: 'Density', prefKey: 'spacing', meta: SPACING_META },
  { id: 'radius', label: 'Radius', prefKey: 'radius', meta: RADIUS_META },
  { id: 'shadow', label: 'Shadow', prefKey: 'shadow', meta: SHADOW_META },
  { id: 'motion', label: 'Motion', prefKey: 'motion', meta: MOTION_META },
  { id: 'editor', label: 'Code editor', prefKey: 'editor', meta: EDITOR_META },
  { id: 'a11y', label: 'Accessibility', prefKey: 'a11y', meta: A11Y_META },
  { id: 'custom', label: 'Custom', prefKey: null, meta: [] },
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

// Generic option card shared by all 10 visual tabs. `renderSwatch` supplies the
// per-tab preview glyph (color window, accent dot, font sample, density bars, …).
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

// Per-tab swatch renderers — each returns a function(item) => JSX, or null for tabs
// that render label-only cards (a11y).
function renderColorsSwatch(item) {
  return (
    <div
      className={styles.swatch}
      style={{ background: item.preview.bg, border: `1px solid ${item.preview.border}` }}
    >
      <div className={styles.swatchSidebar} style={{ background: item.preview.surface }} />
      <div className={styles.swatchContent}>
        <div className={styles.swatchAccentBar} style={{ background: item.preview.accent }} />
        <div className={styles.swatchTextLine} style={{ background: item.preview.text, opacity: 0.8 }} />
        <div className={styles.swatchTextLine} style={{ background: item.preview.text, opacity: 0.4, width: '60%' }} />
      </div>
    </div>
  );
}

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
  return (
    <div className={styles.fontSample} style={{ fontFamily: item.fontFamily }}>Aa</div>
  );
}

function renderCodeFontSwatch(item) {
  return (
    <div className={styles.fontSample} style={{ fontFamily: item.fontFamily }}>{item.sample}</div>
  );
}

function renderSpacingSwatch(item) {
  const gaps = { compact: 2, default: 4, comfortable: 7 };
  const gap = gaps[item.id] ?? 4;
  return (
    <div className={styles.spacingSwatch} style={{ gap }}>
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
  colors: renderColorsSwatch,
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

export default function ThemePanel({ onClose, onOpenBuilder, onOpenMarketplace }) {
  const { preferences, setPreference } = useTheme();
  const [activeTab, setActiveTab] = useState('colors');
  const [hoveredId, setHoveredId] = useState(null);
  const previewRef = useRef(null);
  const panelRef = useRef(null);

  const activeTabDef = TABS.find((t) => t.id === activeTab);

  // While hovering a card, scope the preview to that option without touching the
  // committed preference. Custom tab has no prefKey, so hover never applies there.
  const previewPrefs = useMemo(() => {
    if (hoveredId && activeTabDef?.prefKey) {
      return { ...preferences, [activeTabDef.prefKey]: hoveredId };
    }
    return preferences;
  }, [hoveredId, activeTabDef, preferences]);

  useEffect(() => {
    if (previewRef.current) applyPresetToElement(previewRef.current, previewPrefs);
  }, [previewPrefs]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleSelect = useCallback((value) => {
    if (activeTabDef?.prefKey) setPreference(activeTabDef.prefKey, value);
  }, [activeTabDef, setPreference]);

  const handleTabChange = useCallback((tabId) => {
    setActiveTab(tabId);
    setHoveredId(null);
  }, []);

  // Summary line — active label across all 10 visual axes (custom is skipped; it has
  // no single "active option" since it's a free-form editor).
  const summary = useMemo(() => [
    THEME_META.find((t) => t.id === preferences.theme)?.label,
    ACCENT_META.find((a) => a.id === preferences.accent)?.label,
    FONT_META.find((f) => f.id === preferences.font)?.label,
    CODE_FONT_META.find((c) => c.id === preferences.codeFont)?.label,
    SPACING_META.find((s) => s.id === preferences.spacing)?.label,
    RADIUS_META.find((r) => r.id === preferences.radius)?.label,
    SHADOW_META.find((s) => s.id === preferences.shadow)?.label,
    MOTION_META.find((m) => m.id === preferences.motion)?.label,
    EDITOR_META.find((e) => e.id === preferences.editor)?.label,
    A11Y_META.find((a) => a.id === preferences.a11y)?.label,
  ].filter(Boolean).join(' · '), [preferences]);

  const renderSwatch = activeTabDef ? SWATCH_RENDERERS[activeTabDef.id] : null;

  return (
    <div className={styles.panel} ref={panelRef}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>Appearance</span>
        <div className={styles.headerActions}>
          {onOpenMarketplace && (
            <button type="button" className={styles.builderLink} onClick={onOpenMarketplace}>
              <FiShoppingBag /> Marketplace
            </button>
          )}
          {onOpenBuilder && (
            <button type="button" className={styles.builderLink} onClick={onOpenBuilder}>
              <FiSliders /> Theme builder
            </button>
          )}
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <FiX />
          </button>
        </div>
      </div>

      <div className={styles.panelBody}>
        {/* Left: vertical tab rail + option grid */}
        <div className={styles.left}>
          <div className={styles.tabList}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`${styles.tabItem} ${activeTab === tab.id ? styles.tabItemActive : ''}`}
                onClick={() => handleTabChange(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className={styles.tabContent}>
            {activeTab === 'custom' ? (
              <CustomThemeEditor
                preferences={preferences}
                onPreviewChange={(tokenMap) => {
                  const el = previewRef.current;
                  if (el) {
                    for (const [k, v] of Object.entries(tokenMap)) el.style.setProperty(k, v);
                  }
                }}
                onActivate={(name, tokenMap) => {
                  for (const [k, v] of Object.entries(tokenMap)) {
                    document.documentElement.style.setProperty(k, v);
                  }
                  setPreference('customTheme', name);
                }}
              />
            ) : (
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
            )}
          </div>
        </div>

        {/* Right: live preview + summary */}
        <div className={styles.right}>
          <div className={styles.previewLabel}>Live preview</div>
          <div className={styles.previewPane} ref={previewRef}>
            <PreviewMockup />
          </div>
          <div className={styles.previewSummary}>{summary}</div>
        </div>
      </div>
    </div>
  );
}
