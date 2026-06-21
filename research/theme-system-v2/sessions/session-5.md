# Session 5 — ThemePanel UI Overhaul

**Goal:** Replace the current 2-tab panel (Colors + Font) with a 6-tab panel exposing all dimensions. Better preview pane, better card design, keyboard navigation. The panel becomes a real settings surface, not a mini dropdown.

**Prerequisites:** Sessions 1–4 complete. All 6 preset dimensions exist and are wired.

---

## Design Spec

### Panel layout

```
┌─────────────────────────────────────────────────────────┐
│  Appearance                                          [×] │
├─────┬───────────────────────────────────────────────────┤
│TABS │                   PREVIEW                         │
│     │  ┌─────────────────────────────────────────────┐  │
│● Color  │  [sidebar] [main content mockup]            │  │
│  Font │  │  GET /api/users  ·  200 OK  ·  124ms      │  │
│  Space  │  ┌──────────────────┬──────────────────┐   │  │
│  Radius │  │ key: "value"     │ ●  Results       │   │  │
│  Shadow │  │ num: 42          │ ●  200 OK        │   │  │
│  Motion │  │ bool: true       │ ✓  Assertions    │   │  │
│         │  └──────────────────┴──────────────────┘   │  │
│ ─────── │  └─────────────────────────────────────────┘  │
│[OPTIONS]│                                               │
│  card 1 │  GET /api/users · Inter · Default · Sharp    │
│  card 2 │  (active preferences summary line)           │
│  card 3 │                                               │
└─────┴───────────────────────────────────────────────────┘
```

Panel width: 640px (wider than current 560px — needs space for 6 tabs)  
Panel height: 420px (taller — richer preview)  
Left column: 180px (tabs list + option cards below)  
Right column: flex 1 (preview pane + summary line)

### Preview pane improvements
- Taller: 260px (was ~200px effective height)
- Show MORE mockup content: URL bar, two panels, a badge, a status code
- Font label: "GET /api/users" text in `var(--font-ui)` — visible font change
- Summary line below preview: "Dark · Inter · Comfortable · Sharp · Elevated · Subtle"

### Tab list (vertical, left side)
Each tab is a vertical list item, not a horizontal tab. Icon + label side by side.
Active tab has `var(--accent)` left border (2px, full height of tab item).

### Cards
Each dimension's option cards use a visual swatch/preview:
- **Color**: existing mini color swatch (already works)
- **Font**: larger "Aa" sample in the actual font family (already works)
- **Spacing**: mini diagram showing 3 rectangles with gap increasing left→right
- **Radius**: mini diagram: square → slightly rounded → very rounded
- **Shadow**: mini diagram: flat card → card with shadow → card with deep shadow
- **Motion**: text label (None / Subtle / Full) + icon (⚡ / ∿ / ◎)

---

## Task 1: Rewrite `ThemePanel.jsx`

Full rewrite. Key changes:
1. Add 4 new tabs: Spacing, Radius, Shadow, Motion
2. Import `SPACING_META`, `RADIUS_META`, `SHADOW_META`, `MOTION_META` from `themes/index.js`
3. Vertical tab list (left side, stacked)
4. `preferences` now includes all 6 keys (already in ThemeContext after Session 1)
5. Preview pane: richer mockup with badge + status code visible
6. Summary line below preview
7. Close button (already added in previous session — keep it)

```jsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { FiCheck, FiX } from 'react-icons/fi';
import {
  applyPresetToElement,
  FONT_META, THEME_META,
  SPACING_META, RADIUS_META, SHADOW_META, MOTION_META,
} from '../../themes/index.js';
import { useTheme } from '../ThemeContext.jsx';
import styles from './ThemePanel.module.css';

const TABS = [
  { id: 'colors',  label: 'Color',   prefKey: 'theme',   meta: THEME_META },
  { id: 'font',    label: 'Font',    prefKey: 'font',    meta: FONT_META },
  { id: 'spacing', label: 'Spacing', prefKey: 'spacing', meta: SPACING_META },
  { id: 'radius',  label: 'Radius',  prefKey: 'radius',  meta: RADIUS_META },
  { id: 'shadow',  label: 'Shadow',  prefKey: 'shadow',  meta: SHADOW_META },
  { id: 'motion',  label: 'Motion',  prefKey: 'motion',  meta: MOTION_META },
];

function PreviewMockup() {
  return (
    <div className={styles.mockup}>
      <div className={styles.mockupSidebar}>
        <div className={styles.mockupSidebarItem} />
        <div className={styles.mockupSidebarItem} />
        <div className={styles.mockupSidebarItemActive} />
        <div className={styles.mockupSidebarItem} />
      </div>
      <div className={styles.mockupMain}>
        <div className={styles.mockupHeader}>
          <div className={styles.mockupTabActive} />
          <div className={styles.mockupTab} />
          <div className={styles.mockupTab} />
        </div>
        <div className={styles.mockupBody}>
          <div className={styles.mockupUrlBar}>
            <span className={styles.mockupMethod}>GET</span>
            <div className={styles.mockupUrl} />
            <div className={styles.mockupSendBtn} />
          </div>
          <div className={styles.mockupStatus}>
            <span className={styles.mockupStatusBadge}>200 OK</span>
            <span className={styles.mockupStatusMeta}>124ms · 1.2kb</span>
          </div>
          <div className={styles.mockupPanels}>
            <div className={styles.mockupPanel}>
              <div className={styles.mockupCodeLine} style={{ width: '80%' }} />
              <div className={styles.mockupCodeLine} style={{ width: '60%' }} />
              <div className={styles.mockupCodeLine} style={{ width: '70%' }} />
              <div className={styles.mockupFontLabel}>GET /api/users</div>
            </div>
            <div className={styles.mockupPanel}>
              <div className={styles.mockupLine} style={{ width: '90%' }} />
              <div className={styles.mockupLine} style={{ width: '65%' }} />
              <div className={styles.mockupBadgeRow}>
                <div className={styles.mockupBadgeSuccess} />
                <div className={styles.mockupBadgeError} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Generic option card for any dimension tab
function OptionCard({ item, isActive, onSelect, onHover, renderSwatch }) {
  return (
    <button
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
  const { preferences, setPreference } = useTheme();
  const [activeTab, setActiveTab] = useState('colors');
  const [hoveredPreview, setHoveredPreview] = useState(null);
  const previewRef = useRef(null);
  const panelRef = useRef(null);

  const activeTabDef = TABS.find(t => t.id === activeTab);

  // Build a merged preferences object when hovering
  const previewPrefs = hoveredPreview
    ? { ...preferences, [activeTabDef.prefKey]: hoveredPreview }
    : preferences;

  useEffect(() => {
    if (!previewRef.current) return;
    applyPresetToElement(previewRef.current, previewPrefs);
  }, [previewPrefs]);

  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleSelect = useCallback((value) => {
    setPreference(activeTabDef.prefKey, value);
  }, [activeTabDef, setPreference]);

  const summaryParts = [
    THEME_META.find(t => t.id === preferences.theme)?.label,
    FONT_META.find(f => f.id === preferences.font)?.label,
    SPACING_META.find(s => s.id === preferences.spacing)?.label,
    RADIUS_META.find(r => r.id === preferences.radius)?.label,
    SHADOW_META.find(s => s.id === preferences.shadow)?.label,
    MOTION_META.find(m => m.id === preferences.motion)?.label,
  ].filter(Boolean).join(' · ');

  const renderSwatch = (tab) => {
    if (tab.id === 'colors') return (item) => (
      <div className={styles.swatch} style={{ background: item.preview.bg, border: `1px solid ${item.preview.border}` }}>
        <div className={styles.swatchSidebar} style={{ background: item.preview.surface }} />
        <div className={styles.swatchContent}>
          <div className={styles.swatchAccentBar} style={{ background: item.preview.accent }} />
          <div className={styles.swatchTextLine} style={{ background: item.preview.text, opacity: 0.8 }} />
          <div className={styles.swatchTextLine} style={{ background: item.preview.text, opacity: 0.4, width: '60%' }} />
        </div>
      </div>
    );
    if (tab.id === 'font') return (item) => (
      <div className={styles.fontSample} style={{ fontFamily: item.fontFamily }}>{item.sample}</div>
    );
    // Generic swatch for spacing/radius/shadow/motion — use a small icon or label chip
    return null;
  };

  return (
    <div className={styles.panel} ref={panelRef}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>Appearance</span>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close"><FiX /></button>
      </div>

      <div className={styles.panelBody}>
        {/* Left: vertical tabs + options */}
        <div className={styles.left}>
          <nav className={styles.tabList}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`${styles.tabItem} ${activeTab === tab.id ? styles.tabItemActive : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <div className={styles.tabContent}>
            <div className={styles.grid}>
              {activeTabDef.meta.map((item) => (
                <OptionCard
                  key={item.id}
                  item={item}
                  isActive={preferences[activeTabDef.prefKey] === item.id}
                  onSelect={handleSelect}
                  onHover={setHoveredPreview}
                  renderSwatch={renderSwatch(activeTabDef)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right: live preview */}
        <div className={styles.right}>
          <div className={styles.previewLabel}>Preview</div>
          <div className={styles.previewPane} ref={previewRef}>
            <PreviewMockup />
          </div>
          <div className={styles.previewSummary}>{summaryParts}</div>
        </div>
      </div>
    </div>
  );
}
```

---

## Task 2: Rewrite `ThemePanel.module.css`

Key changes from current CSS:
- Panel: 640px wide, max-width: calc(100vw - 32px), height: auto min-height 420px
- Left column: 180px, border-right, contains vertical tab list + scrollable options
- Tab list: vertical stacked buttons, active has left accent border
- Preview pane: taller (min 260px)
- Status badge + meta line in mockup
- Summary line: small muted text under preview

New/changed classes:
```css
.panel {
  width: 640px;
  max-width: calc(100vw - 32px);
}

.panelBody {
  display: flex;
  height: 400px; /* taller */
}

.left {
  width: 180px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
  flex-shrink: 0;
}

.tabList {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 6px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.tabItem {
  display: flex;
  align-items: center;
  padding: 5px 8px;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-muted);
  background: transparent;
  border: none;
  border-left: 2px solid transparent;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  cursor: pointer;
  text-align: left;
  transition: color var(--duration-fast) var(--easing-default),
              background var(--duration-fast) var(--easing-default);
}
.tabItem:hover {
  color: var(--text);
  background: var(--surface-3);
}
.tabItemActive {
  color: var(--accent);
  border-left-color: var(--accent);
  background: var(--accent-dim);
  font-weight: 600;
}

.previewSummary {
  font-size: var(--text-xs);
  color: var(--text-muted);
  padding: 4px 2px 0;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Status line in mockup */
.mockupStatus {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
  flex-shrink: 0;
}
.mockupStatusBadge {
  font-size: 7px;
  font-weight: 700;
  color: var(--success);
  background: var(--success-bg-dim);
  border-radius: 3px;
  padding: 1px 4px;
}
.mockupStatusMeta {
  font-size: 7px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}
.mockupBadgeRow {
  display: flex;
  gap: 4px;
  margin-top: 2px;
}
.mockupBadgeSuccess {
  width: 28px; height: 8px;
  background: var(--badge-success-bg);
  border-radius: 2px;
}
.mockupBadgeError {
  width: 22px; height: 8px;
  background: var(--badge-error-bg);
  border-radius: 2px;
}
```

---

## Acceptance Criteria

- [ ] ThemePanel shows 6 tabs: Color, Font, Spacing, Radius, Shadow, Motion
- [ ] Changing any tab shows the correct options
- [ ] Hovering a Color option → preview updates live (colors change)
- [ ] Hovering a Font option → preview mockup font text changes
- [ ] Hovering Spacing option → preview spacing shifts (subtle but visible)
- [ ] Summary line reflects current active choices in all 6 dimensions
- [ ] Panel closes on X button click and on outside click
- [ ] Panel max-width < viewport on narrow windows
- [ ] Build passes clean
