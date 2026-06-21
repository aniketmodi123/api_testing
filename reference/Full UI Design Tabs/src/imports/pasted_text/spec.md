# Forge — API Platform Theming UI
## Master Build Spec for Claude Code (multi-session, multi-agent)

> This file is the **single source of truth**. Commit it as `docs/SPEC.md`. Every agent, in every session, reads this in full before writing code, builds only the task it was assigned, and never invents values that already live here.

---

## 0. How to operate (read this first)

**The protocol for every session**
1. Read this whole file. Do not skim.
2. You are assigned **one task ID** (e.g. `T4a`). Build only that task.
3. Touch **only the files listed under "Owns"** for your task. If you need something from another file, import it — do not edit it.
4. Obey the **token law** (§2). A hardcoded color/spacing/radius/shadow is a build failure.
5. When done, tick the task in §12, and confirm the **Definition of Done** for your task.

**Why multi-file:** parallel agents need non-overlapping file ownership. The repo is structured so two agents can work at once without merge conflicts. The token engine and all data (`src/theme/**`) are framework-agnostic; only `src/components/**` is React. If you ever want a single-file vanilla build instead, keep §5–§7 verbatim and collapse the components into one `index.html` — nothing else changes.

---

## 1. Mission

Build the appearance/customization system for **Forge**, a developer-facing API platform (think Postman/Insomnia/Bruno crossed with Linear/Raycast polish). Users customize **independent design layers** and mix-and-match them, choose **preset themes**, or build a theme token-by-token. New themes ship as JSON — never as app-code changes.

**Quality bar:** Linear, GitHub, Vercel, Raycast, Cursor. Clean flat surfaces, hairline borders, strong hierarchy, subtle depth (no heavy shadows), long-session comfort, zero visual noise.

**Avoid:** neon, gradients, glassmorphism, heavy shadows, Material look, gaming aesthetics.

---

## 2. The token law (non-negotiable)

1. **Components read tokens, never literals.** No `#hex`, no `8px` radius, no `0 4px 12px` shadow inside a component. Only `var(--token)`.
2. Every visual decision is a CSS custom property declared once in `tokens.css`.
3. A theme = a set of token values. Switching themes = rewriting variables on `:root`. Nothing re-mounts.
4. The settings UI **dogfoods the tokens** — it restyles along with the preview.
5. Three exceptions, and only these: (a) syntax colors are scoped to the code block via `--syn-*`; (b) chart series via `--chart-*`; (c) traffic-light dots in the title bar (`#F0626A/#D29922/#3FB950`) are decorative constants.

---

## 3. Stack (pinned — do not substitute)

- **Vite + React 18 + TypeScript**
- **Plain CSS with custom properties.** No Tailwind, no CSS-in-JS — they obscure the token model.
- State: React Context (`ThemeContext`) + `useReducer`. No Redux.
- Icons: `lucide-react`, `@heroicons/react`, `@phosphor-icons/react`, `material-symbols` (web font) — one `<Icon>` wrapper switches sets (§6.9).
- Charts: `recharts`.
- Fonts via `@fontsource`: `inter`, `geist`, `ibm-plex-sans`, `jetbrains-mono`, `fira-code`, `ibm-plex-mono`, `geist-mono`. SF Pro falls back to system.
- Persistence: `localStorage` only. No backend.

Setup:
```bash
npm create vite@latest forge-theming -- --template react-ts
cd forge-theming
npm i recharts lucide-react @heroicons/react @phosphor-icons/react
npm i @fontsource/inter @fontsource/geist-sans @fontsource/ibm-plex-sans \
      @fontsource/jetbrains-mono @fontsource/fira-code @fontsource/ibm-plex-mono @fontsource/geist-mono \
      material-symbols
```

---

## 4. Repository structure (file ownership contract)

```
src/
  theme/
    types.ts              ← all TS types (ThemeState, token maps)
    tokens.css            ← :root default tokens + all component CSS that reads them
    engine.ts             ← resolveTokens(), applyTokens(), contrastRatio()
    storage.ts            ← exportTheme(), importTheme(), share link, localStorage
    ThemeContext.tsx      ← provider + useTheme() hook + reducer
    presets/
      colorThemes.ts  accents.ts  typography.ts  codeFonts.ts
      density.ts  radius.ts  shadow.ts  motion.ts
      editorThemes.ts  chartThemes.ts  layouts.ts  components.ts
      icons.ts  a11y.ts  index.ts   ← barrel re-export
  components/
    primitives/   Button.tsx Input.tsx Badge.tsx Table.tsx Select.tsx
                  Segmented.tsx Swatch.tsx Card.tsx Icon.tsx
    AppWindow.tsx                    ← title bar + top tabs + routing
    settings/     SettingsNav.tsx  panels/*Panel.tsx
    preview/      PreviewWorkspace.tsx Sidebar.tsx RequestBar.tsx
                  CodeBlock.tsx ResponsePanel.tsx MiniChart.tsx
    builder/      ThemeBuilder.tsx TokenRow.tsx JsonView.tsx
    marketplace/  Marketplace.tsx ThemeCard.tsx
    modals/       ImportExportModal.tsx
  data/           marketplaceThemes.ts  sampleRequest.ts
  App.tsx  main.tsx
docs/SPEC.md      ← this file
```

**Rule:** `src/theme/**` is owned by foundation tasks (T1/T2). Component tasks import from it and must not edit it. If a component needs a new token, request it as a one-line addition in §5 and the foundation owner adds it.

---

## 5. Token namespace + `tokens.css` defaults

Declare every token once on `:root` with the **Mid Dark** defaults. `applyTokens()` overrides these at runtime.

```css
:root{
  /* surfaces */
  --surface-1:#16181B; --surface-2:#1E2024; --surface-3:#25282D; --surface-inset:#131417;
  /* lines + text */
  --border:#2A2E34; --border-strong:#383D44;
  --text-1:#E7EAEE; --text-2:#9BA3AE; --text-3:#646B75;
  /* accent */
  --accent:#2DD4BF; --accent-fg:#08312A; --accent-soft:rgba(45,212,191,.14);
  /* methods (overridden light/dark by colorTheme) */
  --m-get:#3FB950; --m-post:#D29922; --m-put:#4C8DF6; --m-patch:#A371F7; --m-del:#F0626A;
  /* typography */
  --font-ui:"Inter",system-ui,sans-serif; --font-code:"JetBrains Mono",ui-monospace,monospace;
  --fs-base:14px; --fs-h1:22px; --fs-h2:18px; --fs-h3:16px; --fs-label:12.5px; --fs-cap:11px;
  --fw-reg:400; --fw-med:500;
  /* spacing (density) */
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px;
  --control-h:34px; --row-h:38px;
  /* shape */
  --radius:8px; --radius-sm:5px; --radius-lg:12px;
  /* shadow */
  --shadow:0 1px 2px rgba(0,0,0,.18),0 1px 3px rgba(0,0,0,.12);
  /* motion */
  --dur:220ms; --ease:cubic-bezier(.2,.8,.2,1);
  /* icons */
  --icon-stroke:2; --icon-size:16px;
  /* editor syntax (scoped to code block) */
  --syn-bg:#16161E; --syn-fg:#A9B1D6; --syn-gutter:#565F89; --syn-key:#7AA2F7;
  --syn-string:#9ECE6A; --syn-number:#FF9E64; --syn-bool:#BB9AF7; --syn-prop:#73DACA;
  --syn-punct:#565F89; --syn-comment:#565F89;
  /* charts */
  --chart-1:#2DD4BF; --chart-2:#7AA2F7; --chart-3:#F0626A; --chart-4:#D29922;
  --chart-grid:#2A2E34;
}
@media (prefers-reduced-motion: reduce){ :root{ --dur:0ms; } }
```

Component CSS lives in `tokens.css` too and reads only tokens. Example contract:
```css
.btn{height:var(--control-h);padding:0 var(--space-3);border-radius:var(--radius);
  font:var(--fw-med) var(--fs-label)/1 var(--font-ui);transition:background var(--dur) var(--ease);}
.btn--filled{background:var(--accent);color:var(--accent-fg);border:0;}
.btn--soft{background:var(--accent-soft);color:var(--accent);border:0;}
.btn--outline{background:transparent;color:var(--accent);border:1px solid var(--accent);}
.btn--default{background:var(--surface-3);color:var(--text-1);border:1px solid var(--border);}
.card{background:var(--surface-3);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);}
.code{background:var(--syn-bg);color:var(--syn-fg);font-family:var(--font-code);}
```

---

## 6. Preset data (single source of truth — copy verbatim into `presets/*.ts`)

### 6.1 Color themes — `colorThemes.ts`
Each value object is sprayed onto `:root`. Note: **each theme has its own default accent** — never force one accent across themes.

```ts
export const COLOR_THEMES = {
  light: { label:"Light Professional",
    "--surface-1":"#FFFFFF","--surface-2":"#F6F7F9","--surface-3":"#FFFFFF","--surface-inset":"#F0F2F5",
    "--border":"#E3E6EA","--border-strong":"#D2D7DE",
    "--text-1":"#15181C","--text-2":"#5A626E","--text-3":"#8A929E",
    "--accent":"#2563EB","--accent-fg":"#FFFFFF","--accent-soft":"rgba(37,99,235,.10)",
    "--m-get":"#16803C","--m-post":"#B45309","--m-put":"#1D4ED8","--m-patch":"#7C3AED","--m-del":"#DC2626",
    "--shadow":"0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.10)" },
  middark: { label:"Mid Dark",
    "--surface-1":"#16181B","--surface-2":"#1E2024","--surface-3":"#25282D","--surface-inset":"#131417",
    "--border":"#2A2E34","--border-strong":"#383D44",
    "--text-1":"#E7EAEE","--text-2":"#9BA3AE","--text-3":"#646B75",
    "--accent":"#2DD4BF","--accent-fg":"#08312A","--accent-soft":"rgba(45,212,191,.14)",
    "--m-get":"#3FB950","--m-post":"#D29922","--m-put":"#4C8DF6","--m-patch":"#A371F7","--m-del":"#F0626A",
    "--shadow":"0 1px 2px rgba(0,0,0,.18),0 1px 3px rgba(0,0,0,.12)" },
  deepdark: { label:"Deep Dark",
    "--surface-1":"#0A0B0D","--surface-2":"#101114","--surface-3":"#16181C","--surface-inset":"#0D0E10",
    "--border":"#1E2024","--border-strong":"#2A2D33",
    "--text-1":"#EDEFF2","--text-2":"#8B92A0","--text-3":"#5A606C",
    "--accent":"#818CF8","--accent-fg":"#FFFFFF","--accent-soft":"rgba(129,140,248,.14)",
    "--m-get":"#4ADE80","--m-post":"#FBBF24","--m-put":"#60A5FA","--m-patch":"#C084FC","--m-del":"#FB7185",
    "--shadow":"0 1px 2px rgba(0,0,0,.4),0 1px 3px rgba(0,0,0,.3)" },
  github: { label:"GitHub",
    "--surface-1":"#0D1117","--surface-2":"#0D1117","--surface-3":"#161B22","--surface-inset":"#010409",
    "--border":"#30363D","--border-strong":"#3D444D",
    "--text-1":"#E6EDF3","--text-2":"#9198A1","--text-3":"#6E7681",
    "--accent":"#2F81F7","--accent-fg":"#FFFFFF","--accent-soft":"rgba(47,129,247,.14)",
    "--m-get":"#3FB950","--m-post":"#D29922","--m-put":"#58A6FF","--m-patch":"#BC8CFF","--m-del":"#F85149",
    "--shadow":"0 1px 2px rgba(1,4,9,.4),0 1px 3px rgba(1,4,9,.3)" },
  linear: { label:"Linear",
    "--surface-1":"#0B0C0E","--surface-2":"#0F1011","--surface-3":"#16171A","--surface-inset":"#0A0B0C",
    "--border":"#1F2023","--border-strong":"#2A2B30",
    "--text-1":"#F7F8F8","--text-2":"#8A8F98","--text-3":"#62666D",
    "--accent":"#5E6AD2","--accent-fg":"#FFFFFF","--accent-soft":"rgba(94,106,210,.16)",
    "--m-get":"#4CC38A","--m-post":"#E2B340","--m-put":"#6E8FE8","--m-patch":"#A88BE3","--m-del":"#EB5757",
    "--shadow":"0 2px 8px rgba(0,0,0,.5)" },
} as const;
```

### 6.2 Accent presets — `accents.ts`
`null` = keep the theme's own accent.
```ts
export const ACCENTS = {
  default:{ label:"Theme default", value:null },
  blue:   { label:"Blue",   value:{"--accent":"#3B82F6","--accent-fg":"#FFFFFF","--accent-soft":"rgba(59,130,246,.14)"} },
  indigo: { label:"Indigo", value:{"--accent":"#6366F1","--accent-fg":"#FFFFFF","--accent-soft":"rgba(99,102,241,.14)"} },
  cyan:   { label:"Cyan",   value:{"--accent":"#06B6D4","--accent-fg":"#06262E","--accent-soft":"rgba(6,182,212,.14)"} },
  green:  { label:"Green",  value:{"--accent":"#22C55E","--accent-fg":"#052E16","--accent-soft":"rgba(34,197,94,.14)"} },
  orange: { label:"Orange", value:{"--accent":"#F97316","--accent-fg":"#2A1206","--accent-soft":"rgba(249,115,22,.14)"} },
  red:    { label:"Red",    value:{"--accent":"#EF4444","--accent-fg":"#FFFFFF","--accent-soft":"rgba(239,68,68,.14)"} },
  teal:   { label:"Teal",   value:{"--accent":"#2DD4BF","--accent-fg":"#08312A","--accent-soft":"rgba(45,212,191,.14)"} },
};
// custom: { "--accent": picked, "--accent-fg": contrastRatio(picked,"#FFFFFF")>=3 ? "#FFFFFF":"#0B0B0B", ... }
```

### 6.3 Typography — `typography.ts`
```ts
export const TYPOGRAPHY = {
  inter:  { label:"Inter",        "--font-ui":'"Inter",system-ui,sans-serif' },
  geist:  { label:"Geist",        "--font-ui":'"Geist","Inter",system-ui,sans-serif' },
  ibmplex:{ label:"IBM Plex Sans","--font-ui":'"IBM Plex Sans",system-ui,sans-serif' },
  sfpro:  { label:"SF Pro",       "--font-ui":'-apple-system,"SF Pro Text",system-ui,sans-serif' },
};
```

### 6.4 Code fonts — `codeFonts.ts`
```ts
export const CODE_FONTS = {
  jetbrains:{ label:"JetBrains Mono","--font-code":'"JetBrains Mono",ui-monospace,monospace' },
  geistmono:{ label:"Geist Mono",    "--font-code":'"Geist Mono",ui-monospace,monospace' },
  firacode: { label:"Fira Code",     "--font-code":'"Fira Code",ui-monospace,monospace', ligatures:true },
  ibmplex:  { label:"IBM Plex Mono", "--font-code":'"IBM Plex Mono",ui-monospace,monospace' },
};
```

### 6.5 Density — `density.ts`
```ts
export const DENSITY = {
  compact:    { label:"Compact",    "--space-1":"3px","--space-2":"6px","--space-3":"9px","--space-4":"12px","--control-h":"28px","--row-h":"30px","--fs-base":"13px" },
  standard:   { label:"Standard",   "--space-1":"4px","--space-2":"8px","--space-3":"12px","--space-4":"16px","--control-h":"34px","--row-h":"38px","--fs-base":"14px" },
  comfortable:{ label:"Comfortable","--space-1":"5px","--space-2":"10px","--space-3":"15px","--space-4":"20px","--control-h":"40px","--row-h":"46px","--fs-base":"15px" },
};
```

### 6.6 Radius / Shadow / Motion
```ts
// radius.ts
export const RADIUS = {
  sharp: { label:"Sharp", "--radius":"2px","--radius-sm":"1px","--radius-lg":"3px" },
  modern:{ label:"Modern","--radius":"8px","--radius-sm":"5px","--radius-lg":"12px" },
  soft:  { label:"Soft",  "--radius":"12px","--radius-sm":"8px","--radius-lg":"18px" },
};
// shadow.ts  (dark-tuned; light themes override --shadow in colorThemes)
export const SHADOW = {
  flat:    { label:"Flat",     "--shadow":"none" },
  subtle:  { label:"Subtle",   "--shadow":"0 1px 2px rgba(0,0,0,.18),0 1px 3px rgba(0,0,0,.12)" },
  elevated:{ label:"Elevated", "--shadow":"0 4px 12px rgba(0,0,0,.28),0 2px 4px rgba(0,0,0,.18)" },
};
// motion.ts
export const MOTION = {
  off:     { label:"Off",     "--dur":"0ms" },
  fast:    { label:"Fast",    "--dur":"90ms" },
  premium: { label:"Premium", "--dur":"220ms" },
};
```

### 6.7 Editor (syntax) themes — `editorThemes.ts`
```ts
export const EDITOR_THEMES = {
  tokyonight: { label:"Tokyo Night",
    "--syn-bg":"#16161E","--syn-fg":"#A9B1D6","--syn-gutter":"#565F89","--syn-key":"#7AA2F7",
    "--syn-string":"#9ECE6A","--syn-number":"#FF9E64","--syn-bool":"#BB9AF7","--syn-prop":"#73DACA",
    "--syn-punct":"#565F89","--syn-comment":"#565F89" },
  github: { label:"GitHub",
    "--syn-bg":"#0D1117","--syn-fg":"#E6EDF3","--syn-gutter":"#8B949E","--syn-key":"#FF7B72",
    "--syn-string":"#A5D6FF","--syn-number":"#79C0FF","--syn-bool":"#79C0FF","--syn-prop":"#7EE787",
    "--syn-punct":"#8B949E","--syn-comment":"#8B949E" },
  onedark: { label:"One Dark",
    "--syn-bg":"#282C34","--syn-fg":"#ABB2BF","--syn-gutter":"#5C6370","--syn-key":"#C678DD",
    "--syn-string":"#98C379","--syn-number":"#D19A66","--syn-bool":"#56B6C2","--syn-prop":"#E06C75",
    "--syn-punct":"#ABB2BF","--syn-comment":"#5C6370" },
  catppuccin: { label:"Catppuccin Mocha",
    "--syn-bg":"#1E1E2E","--syn-fg":"#CDD6F4","--syn-gutter":"#6C7086","--syn-key":"#CBA6F7",
    "--syn-string":"#A6E3A1","--syn-number":"#FAB387","--syn-bool":"#F9E2AF","--syn-prop":"#89DCEB",
    "--syn-punct":"#9399B2","--syn-comment":"#6C7086" },
  monokai: { label:"Monokai",
    "--syn-bg":"#272822","--syn-fg":"#F8F8F2","--syn-gutter":"#75715E","--syn-key":"#F92672",
    "--syn-string":"#E6DB74","--syn-number":"#AE81FF","--syn-bool":"#AE81FF","--syn-prop":"#A6E22E",
    "--syn-punct":"#F8F8F2","--syn-comment":"#75715E" },
};
```

### 6.8 Chart themes — `chartThemes.ts`
```ts
export const CHART_THEMES = {
  linear:    { label:"Linear",     "--chart-1":"var(--accent)","--chart-2":"#7AA2F7","--chart-3":"#A371F7","--chart-4":"#4CC38A","--chart-grid":"transparent", roundedBars:true, gridlines:false },
  github:    { label:"GitHub",     "--chart-1":"#39D353","--chart-2":"#26A641","--chart-3":"#006D32","--chart-4":"#0E4429","--chart-grid":"var(--border)", roundedBars:false, gridlines:true },
  minimal:   { label:"Minimal",    "--chart-1":"var(--text-2)","--chart-2":"var(--accent)","--chart-3":"var(--text-3)","--chart-4":"var(--border-strong)","--chart-grid":"transparent", roundedBars:false, gridlines:false },
  enterprise:{ label:"Enterprise", "--chart-1":"#4C8DF6","--chart-2":"#2DD4BF","--chart-3":"#D29922","--chart-4":"#F0626A","--chart-grid":"var(--border)", roundedBars:false, gridlines:true },
};
```

### 6.9 Icons — `icons.ts`
Map a stable name set to each library. `<Icon name="send" />` switches based on `state.icon`.
```ts
// state.icon ∈ "lucide" | "heroicons" | "phosphor" | "material"
// Wrapper picks the component from the active set; sets --icon-stroke where supported.
export const ICON_SETS = {
  lucide:    { label:"Lucide",    stroke:2 },
  heroicons: { label:"Heroicons", stroke:1.5 },
  phosphor:  { label:"Phosphor",  stroke:1.5 },
  material:  { label:"Material",  filled:true },
};
// Required glyph names across all sets: search, send, folder, plus, settings, copy,
// download, upload, check, chevron-down, x, code, palette, droplet, share, file.
```

### 6.10 Component styles — `components.ts`
Applied as data-attributes on `<PreviewWorkspace>` (and globally via context): `data-btn`, `data-input`, `data-table`, `data-badge`.
```ts
export const COMPONENTS = {
  button: { options:["default","soft","filled","outline"], default:"filled" },
  input:  { options:["minimal","standard","elevated"],     default:"standard" },
  table:  { options:["dense","standard","comfortable"],     default:"standard" },
  badge:  { options:["minimal","filled","soft"],            default:"soft" },
};
```
CSS contract for input variants (read tokens only):
```css
.input--minimal{background:transparent;border:0;border-bottom:1px solid var(--border);border-radius:0;}
.input--standard{background:var(--surface-inset);border:1px solid var(--border);border-radius:var(--radius-sm);}
.input--elevated{background:var(--surface-3);border:1px solid var(--border);border-radius:var(--radius-sm);box-shadow:var(--shadow);}
```

### 6.11 Layout presets — `layouts.ts`
Switches `<PreviewWorkspace>` structure (class on root).
```ts
export const LAYOUTS = {
  postman:{ label:"Postman", activityBar:false, sidebarW:"118px", panel:"response-below" },
  vscode: { label:"VS Code", activityBar:true,  sidebarW:"180px", panel:"bottom-dock" },
  linear: { label:"Linear",  activityBar:false, sidebarW:"56px",  panel:"hidden" },
};
```

### 6.12 Accessibility — `a11y.ts`
```ts
export const A11Y = {
  standard:     { label:"Standard" },
  highcontrast: { label:"High Contrast", "--border":"var(--border-strong)","--text-2":"var(--text-1)","--focus-ring":"2px solid var(--accent)" },
  largetext:    { label:"Large Text", scale:1.15 }, // multiply --fs-* and --control-h
};
```

---

## 7. The engine — `engine.ts` (contract; implement exactly these signatures)

```ts
import type { ThemeState } from "./types";
import { COLOR_THEMES, ACCENTS, TYPOGRAPHY, CODE_FONTS, DENSITY, RADIUS,
         SHADOW, MOTION, EDITOR_THEMES, CHART_THEMES, A11Y } from "./presets";

/** Merge every selected layer into one flat token map. Order matters:
 *  color → density → radius → shadow → motion → typography → codeFont →
 *  editor → chart → accent override → a11y → user overrides (win last). */
export function resolveTokens(s: ThemeState): Record<string,string>;

/** Write the resolved map onto a root element via root.style.setProperty. */
export function applyTokens(s: ThemeState, root: HTMLElement = document.documentElement): void;

/** WCAG contrast ratio (1..21) for the live a11y readout and custom-accent fg pick. */
export function contrastRatio(hex1: string, hex2: string): number;
```

`types.ts`:
```ts
export interface ThemeState {
  color: keyof typeof COLOR_THEMES;
  accent: keyof typeof ACCENTS | string;   // preset key OR custom "#RRGGBB"
  typography: keyof typeof TYPOGRAPHY;
  codeFont: keyof typeof CODE_FONTS;
  density: keyof typeof DENSITY;
  radius: keyof typeof RADIUS;
  shadow: keyof typeof SHADOW;
  motion: keyof typeof MOTION;
  icon: "lucide"|"heroicons"|"phosphor"|"material";
  components: { button:string; input:string; table:string; badge:string };
  layout: keyof typeof LAYOUTS;
  chart: keyof typeof CHART_THEMES;
  editor: keyof typeof EDITOR_THEMES;
  a11y: keyof typeof A11Y;
  overrides: Record<string,string>;          // advanced token editor
  name: string;
}
export const DEFAULT_STATE: ThemeState = {
  color:"middark", accent:"default", typography:"inter", codeFont:"jetbrains",
  density:"standard", radius:"modern", shadow:"subtle", motion:"premium",
  icon:"lucide", components:{button:"filled",input:"standard",table:"standard",badge:"soft"},
  layout:"postman", chart:"linear", editor:"tokyonight", a11y:"standard",
  overrides:{}, name:"Mid Dark",
};
```

`storage.ts`:
```ts
export const exportTheme = (s:ThemeState) => JSON.stringify(s,null,2);
export const importTheme = (json:string):ThemeState => ({ ...DEFAULT_STATE, ...JSON.parse(json) });
export const shareLink   = (s:ThemeState) => `${location.origin}/?t=${btoa(exportTheme(s))}`;
export const save = (s:ThemeState) => localStorage.setItem("forge.theme", exportTheme(s));
export const load = ():ThemeState => { const r=localStorage.getItem("forge.theme"); return r?importTheme(r):DEFAULT_STATE; };
```

`ThemeContext.tsx`: provider holds `state`, runs `applyTokens` + `save` in a `useEffect([state])`, exposes `useTheme()` → `{ state, set<Layer>, setToken, reset, duplicate, importFrom }`.

---

## 8. Screens (build to these specs; visual reference = the four mockups I designed)

**8.1 App window** — title bar (3 traffic dots, "Forge · Appearance", window glyphs), top tabs `Appearance | Theme builder | Marketplace`, right-aligned `Import`/`Export`. Tabs switch the body.

**8.2 Appearance** — left **category nav** (Color theme, Accent, Typography, Code font, Density, Radius, Shadows, Motion, Icons, Components, Layout, Charts, Code editor, Accessibility, divider, Advanced editor). Right = the active **panel** + a persistent **Live preview** card. Selecting any control calls the matching `set*` and the preview updates instantly. Color-theme panel shows the 5 preset cards (each with a 3-swatch mini palette + its own accent dot) + accent swatch row + Density/Radius/Shadow/Motion segmented controls.

**8.3 Live preview = API workspace** — sidebar (collection + method-colored request rows GET/POST/PUT/DELETE), request bar (`GET api.forge.dev/v1/users?limit=20` + Send), body tabs (Body active / Params / Headers / Auth), JSON request body rendered with `--syn-*`, response strip (`200 OK · 142 ms · 2.4 KB`) + response JSON. This single component exercises color, type, code font, radius, density, shadow, motion, editor theme, component styles, and layout.

**8.4 Theme builder** — left: editable **token rows** (swatch + mono name + hex `<input type="color">`) grouped Surfaces / Borders & text / Accent, plus Radius + Spacing sliders. Right: live **`theme.json`** view (syntax-colored) + `Export` / `Share`, header actions `Duplicate` / `Reset` / `Save theme`. Editing a row writes `state.overrides[name]` → `applyTokens`.

**8.5 Marketplace** — searchable grid of `ThemeCard`s (name, author, install count, a 4-swatch palette strip, Install / Installed). Cards come from `data/marketplaceThemes.ts` (Tokyo Night Pro, Catppuccin Mocha, Gruvbox, Nord, Rosé Pine, Solarized Light, + more). Install merges the card's token map into state.

**8.6 Import/export modal** — textarea bound to `exportTheme`/`importTheme`, `Copy`, `Download` (data-URI `.json`), `Share` (copies `shareLink`), drop zone for a `.json` file. Use a normal-flow faux-viewport overlay (no `position:fixed`).

**8.7 Responsive / mobile** — ≤900px: category nav becomes a horizontal scroller; preview drops below controls. ≤560px: single column, sidebar in preview collapses to method dots; controls are full-width; show inside a phone frame for the mobile mock.

---

## 9. Visual language (apply everywhere)

- **Type scale:** h1 22 / h2 18 / h3 16 / body `--fs-base` / label 12.5 / caption 11. Weights **400 & 500 only**. Sentence case everywhere.
- **Borders:** 1px `--border`; emphasis `--border-strong`. Depth comes from surface steps (1→2→3) + hairlines, not big shadows.
- **Focus:** visible ring `--focus-ring` (default `2px solid var(--accent)` offset 2px) on every interactive element.
- **Spacing:** use `--space-*` tokens, never literals.
- **Method labels:** mono, weight 500, colored via `--m-*`, on transparent (not filled pills).
- **Motion:** transitions use `var(--dur) var(--ease)`; respect `prefers-reduced-motion` and the Motion=Off setting.
- **Copy voice:** active, plain, end-user framed ("Save theme", not "Submit"; "Install", consistent through toasts).

---

## 10. Definition of Done (global)

- [ ] Zero hardcoded colors/spacing/radius/shadow in `components/**` (grep for `#`, `px` in tsx → only allowed in `tokens.css` and `presets/**`).
- [ ] Switching color theme restyles **both** the settings UI and the preview, no remount.
- [ ] Every layer in §6 is wired and visibly changes the preview.
- [ ] Export → Import round-trips an identical theme. Reload restores from `localStorage`.
- [ ] Keyboard focus visible; `prefers-reduced-motion` honored; high-contrast + large-text modes pass.
- [ ] Responsive at 1280 / 900 / 560 px.

---

## 11. Task board (assign one ID per agent/session)

Format: **ID — title** · _depends on_ · **Owns** (files this task may write).

**T0 — Scaffold** · — · Owns: repo root, `package.json`, `vite.config.ts`, `main.tsx`, `App.tsx` (shell only), font imports. _DoD:_ `npm run dev` renders an empty App window frame.

**T1 — Token engine** · T0 · Owns: `theme/types.ts`, `theme/tokens.css`, `theme/engine.ts`, `theme/storage.ts`, `theme/ThemeContext.tsx`. _DoD:_ `applyTokens(DEFAULT_STATE)` paints Mid Dark; `useTheme()` works; round-trip + localStorage pass.

**T2 — Preset data** · T0 · Owns: all `theme/presets/*.ts` + `index.ts`. _DoD:_ every object from §6 present and typed; barrel exports compile.

**T3 — Primitives** · T1,T2 · Owns: `components/primitives/*`. _DoD:_ Button/Input/Badge/Table/Select/Segmented/Swatch/Card/Icon each read only tokens and honor their variant props.

**T4a — App window + tabs** · T1 · Owns: `components/AppWindow.tsx`. _DoD:_ title bar + 3 tabs + Import/Export buttons; routes body.

**T4b — Settings nav + panels** · T2,T3 · Owns: `components/settings/**`. _DoD:_ all 15 categories render; each control calls the right `set*`.

**T5 — Live preview workspace** · T2,T3 · Owns: `components/preview/**`, `data/sampleRequest.ts`. _DoD:_ API workspace reacts to color/type/codeFont/radius/density/shadow/editor/components/layout.

**T6 — Theme builder** · T1,T3 · Owns: `components/builder/**`. _DoD:_ token rows edit `overrides`; live `theme.json`; export/share/duplicate/reset.

**T7 — Marketplace** · T1,T3 · Owns: `components/marketplace/**`, `data/marketplaceThemes.ts`. _DoD:_ grid + search + Install merges tokens.

**T8 — Import/export modal** · T1,T3 · Owns: `components/modals/ImportExportModal.tsx`. _DoD:_ copy/download/share/drop-import all work; faux-viewport overlay.

**T9 — Charts + data-viz themes** · T2,T3 · Owns: `components/preview/MiniChart.tsx`. _DoD:_ recharts bar+line reads `--chart-*`; 4 chart themes switch.

**T10 — Responsive/mobile** · T4*,T5 · Owns: media queries in `tokens.css` + layout tweaks (coordinate with owners). _DoD:_ 1280/900/560 pass; phone-frame mobile view.

**T11 — Accessibility** · T1,T4b · Owns: `a11y.ts` wiring + `contrastRatio` readout in the Accessibility panel. _DoD:_ high-contrast/large-text apply; live WCAG ratio shown.

**T12 — QA pass** · all · Owns: nothing (review only). _DoD:_ §10 fully checked; grep audit clean.

Parallel-safe sets after T0–T2 land: `{T4a, T4b, T5, T6, T7, T8, T9}` can run concurrently (disjoint files). T10/T11/T12 run last.

---

## 12. Progress checklist (tick as you go)
- [ ] T0  - [ ] T1  - [ ] T2  - [ ] T3  - [ ] T4a  - [ ] T4b  - [ ] T5  - [ ] T6  - [ ] T7  - [ ] T8  - [ ] T9  - [ ] T10  - [ ] T11  - [ ] T12

---

## 13. Ready-to-paste session kickoff prompt

> You are building **Forge**, an API-platform theming UI. Read `docs/SPEC.md` in full first — it is the single source of truth for tokens, data, and contracts.
> Your task this session is **[Txx]**. Build only that task. Write only the files listed under "Owns" for it; import everything else, never edit it.
> Hard rules: components read CSS variables only — no hardcoded hex/px/shadow outside `theme/tokens.css` and `theme/presets/**`. Stack is Vite + React + TS + plain CSS, no Tailwind. Follow the exact signatures in §7 and the data in §6.
> When finished: confirm the task's Definition of Done in §11, tick it in §12, and list any token you needed added to §5 (do not add it yourself unless you own `tokens.css`).
/Users/aniketmodi/Desktop/api_testing/research/theme-system-v2
acording this upgrade the file data to build the ui
infolder the is html file for design