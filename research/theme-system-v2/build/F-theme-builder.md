# Phase F — Theme Builder (full screen)  ⬜ TODO

**Goal:** A full-screen advanced token editor (Figma 8.4). Left = editable token rows grouped
Surfaces / Borders & text / Accent + Radius & Spacing sliders. Right = live syntax-colored
`theme.json` + Export/Share. Header = draft name + Duplicate / Reset / Save theme. Editing a row
writes an override and live-applies it.

**Prereqs:** E (`customTheme.js` helpers). **Owns:**
`frontend/src/components/ThemeBuilder/ThemeBuilder.jsx` + `.module.css`.
**Visual ref:** `research/theme-system-v2/theme_builder_advanced_token_editor.html`.

---

## Layout (all tokenized; mockup hardcodes hex — DO NOT copy literals, use vars)

```
┌ Theme builder · <draftName> (draft)        [Duplicate][Reset][Save theme] ┐
├──────────────────────────────────────────┬─────────────────────────────────┤
│ SURFACES                                 │  theme.json            [copy]    │
│  ■ surface-primary    #1A1C1F  [picker]  │  { "name": "...",                │
│  ■ surface-secondary  #202327            │    "extends": "<base>",          │
│  ■ surface-elevated   #25282D            │    "tokens": { ... },            │
│ BORDERS & TEXT                           │    "typography": "inter", ... }  │
│  ■ border-default / text-1 / text-2      │                                  │
│ ACCENT                                   │  [⬆ Export]      [⤴ Share]       │
│  ■ accent-primary  #2DD4BF  [picker]     │                                  │
│  Radius ───●──  8px    Spacing ──●─ 4px  │                                  │
└──────────────────────────────────────────┴─────────────────────────────────┘
```

- Container: `background:var(--panel-bg)`; header `var(--panel-header-bg)` + `1px solid var(--border)`.
- `.tok` row: `border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--surface-2)`;
  swatch `<input type="color">`; name in `var(--font-mono)` `var(--text-subtle)`; hex in `var(--text-muted)`.
- Right pane `background:var(--code-bg)`; JSON colored with `--viz-json-key/string/number` + `--text-muted` punct.
- Active accent row highlighted with `border-color:var(--accent)`.

## State / behavior

```js
const [baseTheme, setBaseTheme] = useState('dark');
const [overrides, setOverrides] = useState({ ...THEME_PRESETS['dark'] });
const [name, setName] = useState('My Theme');
```

- **Token rows** (editable subset; same keys as Custom editor + a few more):
  Surfaces `--surface-1/-2/-3`; Borders & text `--border --text --text-subtle`; Accent `--accent`.
  On change: `setOverrides(p=>({...p,[key]:val, ...(key==='--accent'?deriveAccent(val):{})}))`.
- **Radius / Spacing sliders**: map slider index → a `RADIUS_PRESETS`/`SPACING_PRESETS` key (or a
  scalar that sets `--radius`/`--space-*`); write into overrides and reflect the px label.
- **Live apply**: `useEffect` → `applyPreset({...preferences, theme:baseTheme}, overrides)` (writes
  `:root` so the whole app — including the builder chrome — restyles), OR scope to a preview node if
  you prefer non-destructive editing. Pick one; document it inline.
- **theme.json view**: derive `{ name, extends: baseTheme, tokens: <diff of overrides vs base>,
  typography, codeFont, editor }` and render it syntax-colored. Recompute on every change.

## Header actions

- **Duplicate** → copy current overrides into a new draft name (`name + ' copy'`).
- **Reset** → `setOverrides({ ...THEME_PRESETS[baseTheme] })`.
- **Save theme** → persist (Phase H backend `POST /themes`; localStorage fallback via
  `saveCustomThemes`); then `applyPreset(preferences, overrides)` + `setPreference('customTheme', name)`.
- **Export** → `exportThemeJson(name, overrides)`. **Share** → copy a share string
  (`location.origin + '/?t=' + btoa(JSON.stringify({name, token_map: overrides}))`) to clipboard.

## Mount

Add a route/full-screen view reachable from the appearance entry point (the existing
`Layout/Header/.../ThemeToggle.jsx` menu or `IconSidebar`). Reuse the app's existing
modal/route pattern — confirm against current navigation, don't invent a router.

---

## Acceptance

- Editing any token row live-updates the app + the theme.json view. Accent edit cascades.
- Radius/Spacing sliders change the px label and the live look.
- Duplicate / Reset / Save / Export / Share all work. No hardcoded hex/px in the component CSS.
- `npm run build` clean.
