# Phase D — Appearance Panel Overhaul (11 tabs)  ⬜ TODO

**Goal:** Replace the 2-tab ThemePanel with the Forge appearance surface: a left vertical tab
rail (11 categories), a scrollable option grid, and a persistent live preview + summary line on
the right. Every control calls `setPreference(prefKey, value)`; hover gives a scoped preview.

**Prereqs:** A + B (presets + `*_META` exported from `themes/index.js`). **Owns:**
`frontend/src/components/ThemePanel/ThemePanel.jsx` + `ThemePanel.module.css`.
**Visual ref:** `research/theme-system-v2/appearance_settings_window_with_live_preview.html`.

---

## Tabs (order)

```js
import {
  applyPresetToElement,
  THEME_META, ACCENT_META, FONT_META, CODE_FONT_META,
  SPACING_META, RADIUS_META, SHADOW_META, MOTION_META, EDITOR_META, A11Y_META,
} from '../../themes/index.js';

const TABS = [
  { id:'colors',  label:'Color',        prefKey:'theme',    meta:THEME_META },
  { id:'accent',  label:'Accent',       prefKey:'accent',   meta:ACCENT_META },
  { id:'font',    label:'Typography',   prefKey:'font',     meta:FONT_META },
  { id:'codeFont',label:'Code font',    prefKey:'codeFont', meta:CODE_FONT_META },
  { id:'spacing', label:'Density',      prefKey:'spacing',  meta:SPACING_META },
  { id:'radius',  label:'Radius',       prefKey:'radius',   meta:RADIUS_META },
  { id:'shadow',  label:'Shadow',       prefKey:'shadow',   meta:SHADOW_META },
  { id:'motion',  label:'Motion',       prefKey:'motion',   meta:MOTION_META },
  { id:'editor',  label:'Code editor',  prefKey:'editor',   meta:EDITOR_META },
  { id:'a11y',    label:'Accessibility',prefKey:'a11y',     meta:A11Y_META },
  { id:'custom',  label:'Custom',       prefKey:null,       meta:[] }, // Phase E renders editor
];
```

## Layout (`.module.css`)

- Panel: `width:680px; max-width:calc(100vw - 32px);`. Body `display:flex; height:440px;`.
- Left `.left`: `width:188px; border-right:1px solid var(--border)`, contains `.tabList` (vertical,
  scroll) then `.tabContent` (option grid, scroll). Active tab item: `color:var(--accent);
  border-left:2px solid var(--accent); background:var(--accent-dim);`.
- Right `.right`: flex 1, `.previewLabel`, `.previewPane` (ref target, min 280px), `.previewSummary`.
- All values use tokens (radius/space/duration). Keep the panel drop shadow hardcoded + commented.

## Generic option card + per-tab swatch

```jsx
function OptionCard({ item, isActive, onSelect, onHover, renderSwatch }) {
  return (
    <button className={`${styles.card} ${isActive?styles.cardActive:''}`}
      onClick={()=>onSelect(item.id)} onMouseEnter={()=>onHover(item.id)} onMouseLeave={()=>onHover(null)}>
      {renderSwatch ? renderSwatch(item) : null}
      <div className={styles.cardMeta}>
        <span className={styles.cardLabel}>{item.label}</span>
        <span className={styles.cardDesc}>{item.description}</span>
      </div>
      {isActive && <FiCheck className={styles.cardCheck} />}
    </button>
  );
}
```

`renderSwatch(activeTabDef)` returns a per-tab renderer:
- **colors**: mini window swatch from `item.preview` (bg/surface/border/text/accent) — keep current markup.
- **accent**: a filled dot `background:item.swatch` (skip for `default` → show a "theme" ring).
- **font**: `<div style={{fontFamily:item.fontFamily}}>Aa</div>`.
- **codeFont**: `<div style={{fontFamily:item.fontFamily}}>{item.sample}</div>` (mono).
- **spacing**: 3 bars with increasing gap. **radius**: square→rounded→pill mini boxes.
  **shadow**: 3 cards flat→sm→lg. **motion**: a chip with ⚡/∿/◎ glyph + label.
- **editor**: mini code block `background:item.preview.bg` with 3 colored lines using
  `item.preview.key/string/number`.
- **a11y**: simple label chip (Standard/High Contrast/Large Text).

## Preview + hover

```jsx
const activeTabDef = TABS.find(t=>t.id===activeTab);
const previewPrefs = (hoveredId && activeTabDef.prefKey)
  ? { ...preferences, [activeTabDef.prefKey]: hoveredId } : preferences;
useEffect(()=>{ if(previewRef.current) applyPresetToElement(previewRef.current, previewPrefs); }, [previewPrefs]);
```

The preview mockup = a mini API workspace: sidebar w/ method-colored rows, URL bar + Send, a
`200 OK · 124ms` status line, a JSON body using `--viz-json-*`, and a badge row — so it exercises
color, accent, fonts, density, radius, shadow, motion, and syntax theme at once. (Use the richer
mockup from `sessions/session-5.md` Task 1 as the base; ensure all colors come from tokens.)

## Summary line

Join active labels across all 10 visual axes (skip `custom`):
`THEME_META.find(...)?.label · ACCENT · FONT · CODE_FONT · SPACING · RADIUS · SHADOW · MOTION · EDITOR · A11Y`.

## Custom tab

`{activeTab==='custom' && <CustomThemeEditor … />}` — wired in **Phase E** (props there).

---

## Acceptance

- 11 tabs render; switching shows correct options; active states correct.
- Hover on any non-custom tab updates the preview live (color, accent dot, font, density, radius,
  shadow, motion, syntax all visibly change).
- Summary line reflects all 10 axes. Closes on ✕ and outside click. `max-width` < viewport.
- `npm run build` clean.
