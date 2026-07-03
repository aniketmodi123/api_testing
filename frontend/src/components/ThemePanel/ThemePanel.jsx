import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiActivity,
  FiAlignJustify,
  FiAperture,
  FiCheck,
  FiCode,
  FiDroplet,
  FiEye,
  FiLayers,
  FiSliders,
  FiSquare,
  FiTerminal,
  FiType,
  FiX,
} from 'react-icons/fi';
import {
  isHex,
  loadCustomThemes,
  saveCustomThemes,
} from '../../themes/customTheme.js';
import {
  A11Y_META,
  ACCENT_META,
  applyPresetToElement,
  CODE_FONT_META,
  EDITOR_META,
  FONT_META,
  MOTION_META,
  RADIUS_META,
  SHADOW_META,
  SPACING_META,
  THEME_META,
} from '../../themes/index.js';
import { useTheme } from '../ThemeContext.jsx';
import CustomThemeEditor from './CustomThemeEditor.jsx';
import styles from './ThemePanel.module.css';

// Left-nav axes, in rail order. `prefKey` is the ThemeContext preference each tab edits;
// `meta` is the option list rendered as cards on that tab. `custom` is rendered separately
// below the divider — it has no prefKey/meta (free-form token editor).
const TABS = [
  {
    id: 'colors',
    label: 'Color theme',
    icon: <FiDroplet />,
    prefKey: 'theme',
    meta: THEME_META,
  },
  {
    id: 'accent',
    label: 'Accent',
    icon: <FiAperture />,
    prefKey: 'accent',
    meta: ACCENT_META,
  },
  {
    id: 'font',
    label: 'Typography',
    icon: <FiType />,
    prefKey: 'font',
    meta: FONT_META,
  },
  {
    id: 'codeFont',
    label: 'Code font',
    icon: <FiCode />,
    prefKey: 'codeFont',
    meta: CODE_FONT_META,
  },
  {
    id: 'spacing',
    label: 'Density',
    icon: <FiAlignJustify />,
    prefKey: 'spacing',
    meta: SPACING_META,
  },
  {
    id: 'radius',
    label: 'Radius',
    icon: <FiSquare />,
    prefKey: 'radius',
    meta: RADIUS_META,
  },
  {
    id: 'shadow',
    label: 'Shadow',
    icon: <FiLayers />,
    prefKey: 'shadow',
    meta: SHADOW_META,
  },
  {
    id: 'motion',
    label: 'Motion',
    icon: <FiActivity />,
    prefKey: 'motion',
    meta: MOTION_META,
  },
  {
    id: 'editor',
    label: 'Code editor',
    icon: <FiTerminal />,
    prefKey: 'editor',
    meta: EDITOR_META,
  },
  {
    id: 'a11y',
    label: 'Accessibility',
    icon: <FiEye />,
    prefKey: 'a11y',
    meta: A11Y_META,
  },
];

// Live API-workspace mockup — renders entirely from CSS vars set on its parent element,
// so it doubles as a Preview Studio: a single scene exercising color, accent, fonts,
// density, radius, shadow, motion, and syntax theme at once. Spans/divs only (no real
// interaction) — it exists to make every theme axis visible at a glance.
function PreviewMockup() {
  return (
    <div className={styles.mockup}>
      {/* Collection tree */}
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
        {/* Latency chart strip — exercises accent + radius on small shapes */}
        <div className={styles.mockupChart}>
          {[45, 70, 38, 88, 60, 52].map((h, i) => (
            <span
              key={i}
              className={styles.mockupBar}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>

      {/* Request / response workspace */}
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

        <div className={styles.mockupSplit}>
          {/* Code / JSON editor */}
          <div className={styles.mockupCodeBlock}>
            <div>
              <span className={styles.mockupJsonPunct}>{'{'}</span>
            </div>
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
            <div>
              <span className={styles.mockupJsonPunct}>{'}'}</span>
            </div>
          </div>

          {/* Response viewer + data table */}
          <div className={styles.mockupResponse}>
            <div className={styles.mockupRespHead}>
              <span className={styles.mockupStatusBadge}>200 OK</span>
              <span className={styles.mockupStatusMeta}>124ms</span>
            </div>
            <div className={styles.mockupTable}>
              <div className={styles.mockupTableHead}>
                <span>id</span>
                <span>name</span>
                <span>role</span>
              </div>
              <div className={styles.mockupTableRow}>
                <span>01</span>
                <span>Ada</span>
                <span>admin</span>
              </div>
              <div className={styles.mockupTableRow}>
                <span>02</span>
                <span>Lin</span>
                <span>editor</span>
              </div>
              <div className={styles.mockupTableRow}>
                <span>03</span>
                <span>Sam</span>
                <span>viewer</span>
              </div>
            </div>
          </div>
        </div>

        {/* Controls + badges + toast */}
        <div className={styles.mockupFooter}>
          <span className={styles.mockupBtnPrimary}>Save</span>
          <span className={styles.mockupBtnSecondary}>Cancel</span>
          <span className={styles.mockupInput}>Search requests…</span>
          <div className={styles.mockupBadgeRow}>
            <span className={styles.mockupBadgeSuccess}>Pass</span>
            <span className={styles.mockupBadgeError}>Fail</span>
            <span className={styles.mockupBadgeSpecial}>Beta</span>
          </div>
          <span className={styles.mockupToast}>Saved ✓</span>
        </div>
      </div>
    </div>
  );
}

// Motion demo — plays the common app transitions (button press, toast, modal, dropdown,
// progress) using the live --duration-* / --easing-* tokens. Remounted via a `key` to
// replay, so the selected motion preset's speed + easing is actually visible.
function MotionDemo({ speed = 1 }) {
  // `--md-speed` multiplies the demo's animation durations so fast presets can be slowed
  // down for inspection without touching the real (saved) motion timing.
  return (
    <div className={styles.motionDemo} style={{ '--md-speed': speed }}>
      <div className={styles.motionDemoStage}>
        <span className={styles.motionDemoBtn}>Hover</span>
        <span className={styles.motionDemoToast}>Toast ✓</span>
      </div>
      <div className={styles.motionDemoStage}>
        <div className={styles.motionDemoModal}>
          <span className={styles.motionDemoModalBar} />
          <span className={styles.motionDemoModalBar} style={{ width: '60%' }} />
        </div>
        <div className={styles.motionDemoDropdown}>
          <span /><span /><span />
        </div>
      </div>
      <div className={styles.motionDemoProgressTrack}>
        <span className={styles.motionDemoProgress} />
      </div>
    </div>
  );
}

// Three-square swatch + label theme card (used for both built-in themes and community presets).
function ThemeCardFig({
  id,
  swatches,
  label,
  sub,
  subAccent,
  active,
  onSelect,
  onHover,
}) {
  return (
    <button
      type="button"
      className={`${styles.themeCard} ${active ? styles.themeCardActive : ''}`}
      onClick={onSelect}
      onMouseEnter={() => onHover?.(id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <div className={styles.themeSwatches}>
        {swatches.map((s, i) => (
          <span
            key={i}
            className={styles.themeSw}
            style={{
              background: s.bg,
              border: s.border ? `1px solid ${s.border}` : 'none',
            }}
          />
        ))}
      </div>
      <div className={styles.themeName}>{label}</div>
      <div
        className={styles.themeSub}
        style={subAccent ? { color: 'var(--accent)' } : undefined}
      >
        {sub}
        {active ? ' · active' : ''}
      </div>
    </button>
  );
}

// === Per-tab swatch renderers (generic option grid on non-color tabs) ===

function renderAccentSwatch(item) {
  if (item.id === 'default') {
    return (
      <div className={styles.accentSwatch} aria-hidden="true">
        <span className={styles.accentRing} />
      </div>
    );
  }
  return (
    <div className={styles.accentSwatch}>
      <span className={styles.accentDot} style={{ background: item.swatch }} />
    </div>
  );
}

function renderFontSwatch(item) {
  return (
    <div className={styles.fontSample} style={{ fontFamily: item.fontFamily }}>
      Aa
    </div>
  );
}

function renderCodeFontSwatch(item) {
  return (
    <div className={styles.codeSample} style={{ fontFamily: item.fontFamily }}>
      {item.sample}
    </div>
  );
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
  const radii = { sharp: 0, compact: 5, modern: 9, friendly: 14, pill: 999 };
  return (
    <div className={styles.radiusSwatch}>
      <span
        className={styles.radiusBox}
        style={{ borderRadius: radii[item.id] ?? 9 }}
      />
    </div>
  );
}

function renderShadowSwatch(item) {
  const depths = {
    flat: styles.shadowCardFlat,
    soft: styles.shadowCardSm,
    elevated: styles.shadowCardMd,
    floating: styles.shadowCardLg,
    glass: styles.shadowCardGlass,
  };
  return (
    <div className={styles.shadowSwatch}>
      <span className={`${styles.shadowCard} ${depths[item.id] ?? ''}`} />
    </div>
  );
}

function renderMotionSwatch(item) {
  const glyphs = {
    instant: '○',
    fast: '»',
    balanced: '∿',
    smooth: '~',
    expressive: '✦',
  };
  return (
    <div className={styles.motionChip}>
      <span className={styles.motionGlyph}>{glyphs[item.id] ?? '∿'}</span>
    </div>
  );
}

function renderEditorSwatch(item) {
  return (
    <div
      className={styles.editorSwatch}
      style={{ background: item.preview.bg }}
    >
      <span
        className={styles.editorLine}
        style={{ background: item.preview.key, width: '70%' }}
      />
      <span
        className={styles.editorLine}
        style={{ background: item.preview.string, width: '50%' }}
      />
      <span
        className={styles.editorLine}
        style={{ background: item.preview.number, width: '60%' }}
      />
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
  // Bumped to replay the motion demo (remounts it) whenever the motion preset changes.
  const [motionPlay, setMotionPlay] = useState(0);
  // Demo-only slowdown multiplier (1×–12×) so fast presets are distinguishable by eye.
  const [motionSpeed, setMotionSpeed] = useState(1);
  const previewRef = useRef(null);
  const panelRef = useRef(null);

  const activeTabDef = TABS.find(t => t.id === activeTab);

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
      const ct = loadCustomThemes().find(
        t => t.name === preferences.customTheme
      );
      if (ct)
        for (const [k, v] of Object.entries(ct.token_map))
          el.style.setProperty(k, v);
    }
    // Flash a highlight ring so the change is obvious even when Motion = Instant
    // (the pulse uses fixed timing, independent of the --duration-* tokens).
    el.classList.remove(styles.previewPulse);
    void el.offsetWidth; // force reflow to restart the animation
    el.classList.add(styles.previewPulse);
    // On the motion tab, motion timing is invisible in a static scene — replay the demo
    // so the hovered/selected duration + easing actually plays.
    if (activeTab === 'motion') setMotionPlay(p => p + 1);
  }, [previewPrefs, hoveredId, preferences.customTheme, activeTab]);

  // Close on outside click
  useEffect(() => {
    const handler = e => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Select a built-in theme — clears any active community/custom override so the base
  // preset shows through cleanly (ThemeContext re-overlays customTheme otherwise).
  const selectBuiltinTheme = useCallback(
    id => {
      setActiveServerTheme(null);
      setPreference('customTheme', null);
      setPreference('theme', id);
    },
    [setActiveServerTheme, setPreference]
  );

  // Apply a community preset — writes its token_map to :root for instant feedback, then
  // persists it as a named custom theme (same store the Custom tab reads), so it survives
  // reload and the ThemeContext overlay re-applies it on later preference changes.
  const applyCommunityPreset = useCallback(
    theme => {
      const root = document.documentElement;
      for (const [k, v] of Object.entries(theme.token_map))
        root.style.setProperty(k, v);

      const themes = loadCustomThemes();
      const idx = themes.findIndex(t => t.name === theme.name);
      const entry = {
        name: theme.name,
        token_map: theme.token_map,
        created_at: new Date().toISOString(),
      };
      if (idx >= 0) themes[idx] = entry;
      else themes.push(entry);
      saveCustomThemes(themes);

      setActiveServerTheme(null);
      setPreference('customTheme', theme.name);
    },
    [setActiveServerTheme, setPreference]
  );

  const handleSelect = useCallback(
    value => {
      if (!activeTabDef?.prefKey) return;
      setPreference(activeTabDef.prefKey, value);
      // Choosing a preset accent clears any custom accent so the preset wins + shows active.
      if (activeTabDef.prefKey === 'accent')
        setPreference('customAccent', null);
    },
    [activeTabDef, setPreference]
  );

  const handleTabChange = useCallback(tabId => {
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
        <button
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close"
        >
          <FiX />
        </button>
      </div>

      <div className={styles.panelBody}>
        {/* Left nav */}
        <nav className={styles.nav}>
          <div className={styles.navLabel}>CUSTOMIZE</div>
          {TABS.map(tab => (
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
            <span className={styles.navIcon}>
              <FiSliders />
            </span>
            Custom editor
          </button>
        </nav>

        {/* Content: scrollable controls + pinned live preview */}
        <div className={styles.content}>
          <div className={styles.contentScroll}>
            {activeTab === 'colors' && (
              <>
                <div className={styles.panelTitle2}>Color theme</div>
                <div className={styles.panelSub}>
                  Each preset ships its own personality. Accent isn&apos;t
                  forced across themes.
                </div>

                <div className={styles.themeGrid}>
                  {THEME_META.map(t => (
                    <ThemeCardFig
                      key={t.id}
                      id={t.id}
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
                      onHover={setHoveredId}
                    />
                  ))}
                </div>
              </>
            )}

            {activeTab === 'custom' && (
              <CustomThemeEditor
                preferences={preferences}
                onPreviewChange={tokenMap => {
                  const el = previewRef.current;
                  if (el)
                    for (const [k, v] of Object.entries(tokenMap))
                      el.style.setProperty(k, v);
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
                  {activeTabDef.meta.map(item => (
                    <OptionCard
                      key={item.id}
                      item={item}
                      isActive={
                        activeTabDef.id === 'accent'
                          ? !preferences.customAccent &&
                            preferences.accent === item.id
                          : preferences[activeTabDef.prefKey] === item.id
                      }
                      onSelect={handleSelect}
                      onHover={setHoveredId}
                      renderSwatch={renderSwatch}
                    />
                  ))}

                  {/* Custom accent — native color picker, applied live as preferences.customAccent */}
                  {activeTabDef.id === 'accent' && (
                    <label
                      className={`${styles.card} ${preferences.customAccent ? styles.cardActive : ''}`}
                    >
                      <span className={styles.accentSwatch}>
                        <span
                          className={styles.accentDot}
                          style={{
                            background:
                              preferences.customAccent ||
                              'conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)',
                          }}
                        />
                        <input
                          type="color"
                          className={styles.accentPickerInput}
                          value={
                            isHex(preferences.customAccent)
                              ? preferences.customAccent
                              : '#8b5cf6'
                          }
                          onChange={e =>
                            setPreference('customAccent', e.target.value)
                          }
                          aria-label="Custom accent color"
                        />
                      </span>
                      <div className={styles.cardMeta}>
                        <span className={styles.cardLabel}>Custom color</span>
                        <span className={styles.cardDesc}>
                          {preferences.customAccent || 'Pick any accent'}
                        </span>
                      </div>
                      {preferences.customAccent && (
                        <FiCheck className={styles.cardCheck} />
                      )}
                    </label>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Pinned live preview — always visible on every tab. On the motion tab it
              swaps to a replayable motion demo so timing/easing changes are visible. */}
          <div className={styles.previewRegion}>
            <div className={styles.previewHead}>
              <span className={styles.previewDot} />
              <span className={styles.previewLabel}>
                {activeTab === 'motion' ? 'Motion preview' : 'Live preview'}
              </span>
              {activeTab === 'motion' && (
                <div className={styles.motionControls}>
                  <span className={styles.motionSpeedLabel}>{motionSpeed}× slower</span>
                  <input
                    type="range"
                    min="1"
                    max="12"
                    step="1"
                    value={motionSpeed}
                    className={styles.motionSpeedSlider}
                    onChange={e => {
                      setMotionSpeed(Number(e.target.value));
                      setMotionPlay(p => p + 1);
                    }}
                    aria-label="Demo playback speed"
                  />
                  <button
                    type="button"
                    className={styles.replayBtn}
                    onClick={() => setMotionPlay(p => p + 1)}
                  >
                    <FiActivity /> Replay
                  </button>
                </div>
              )}
            </div>
            <div className={styles.previewBox} ref={previewRef}>
              {activeTab === 'motion'
                ? <MotionDemo key={motionPlay} speed={motionSpeed} />
                : <PreviewMockup />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
