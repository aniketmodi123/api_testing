# Phase G — Marketplace screen + seed themes  ⬜ TODO

**Goal:** A searchable grid of community theme cards (Figma 8.5). Each card: name, author,
install count, a 4-swatch palette strip, and Install / Installed. Install merges the card's
`token_map` into state as a custom theme (persisted via Phase H; localStorage fallback).

**Prereqs:** E (`customTheme.js`). **Owns:**
`frontend/src/components/Marketplace/Marketplace.jsx`, `ThemeCard.jsx`, `Marketplace.module.css`,
and `frontend/src/data/marketplaceThemes.js`.
**Visual ref:** `research/theme-system-v2/theme_marketplace_screen.html`.

---

## Task 1 — `frontend/src/data/marketplaceThemes.js`

Array of seed themes. Each: `{ id, name, author, tag, installs, palette:[4 hex], token_map }`.
`palette` = the 4 swatches shown on the card (bg, surface, accent, secondary-accent). `token_map`
= a partial override map (at minimum `--bg --surface-1 --surface-2 --surface-3 --border --text
--text-subtle --text-muted --accent --accent-hover --accent-dim --accent-text` + the `--viz-json-*`
syntax set) so Install produces a coherent theme. Seed list (palettes from the mockup):

| id | name | author | tag | installs | palette |
|---|---|---|---|---|---|
| tokyo-night-pro | Tokyo Night Pro | enkia | Dark | 48200 | `#1a1b26 #24283b #7AA2F7 #BB9AF7` |
| catppuccin-mocha | Catppuccin Mocha | catppuccin | Dark | 91700 | `#1e1e2e #313244 #cba6f7 #94e2d5` |
| gruvbox | Gruvbox | morhetz | Warm | 33000 | `#282828 #3c3836 #fabd2f #b8bb26` |
| nord | Nord | arcticicestudio | Cool | 71400 | `#2e3440 #3b4252 #88c0d0 #a3be8c` |
| rose-pine | Rosé Pine | rose-pine | Dark | 56800 | `#191724 #26233a #ebbcba #9ccfd8` |
| solarized-light | Solarized Light | altercation | Light | 40100 | `#FFFFFF #FDF6E3 #268BD2 #2AA198` |

(Fill each `token_map` from the palette + sensible text/border values. Reuse `deriveAccent` for accent vars.)

## Task 2 — `ThemeCard.jsx`

Props `{ theme, isInstalled, onInstall }`. Markup:
- `.pal` strip: 4 `<span>` each `flex:1; background:<palette[i]>` (inline style is allowed here —
  these are data-driven preview swatches, like THEME_META, not chrome).
- `.ft` footer: name (`var(--text)`), `.tag` chip (`var(--badge-neutral-*)`), author + install count
  (`var(--text-muted)`, format installs `48.2k`), and the action button:
  - not installed → `Install`, `background:var(--btn-primary-bg); color:var(--btn-primary-text)`.
  - installed → `Installed` with check, `border:1px solid var(--border); color:var(--text-subtle)`.
- Card: `border:1px solid var(--border); border-radius:var(--radius-md); background:var(--surface-2)`.

## Task 3 — `Marketplace.jsx`

- Header: title, a search input (`var(--input-*)`), filter chips (Popular/Newest/Dark/Light) —
  filter/sort `MARKETPLACE_THEMES` by `tag` + `name` query + `installs`.
- Grid: `grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:var(--space-3)`.
- Track installed ids in state seeded from `loadCustomThemes()` (names) / backend list.
- `onInstall(theme)`:
  ```js
  // merge into :root + persist as a custom theme named after the card
  for (const [k,v] of Object.entries(theme.token_map)) document.documentElement.style.setProperty(k,v);
  setPreference('customTheme', theme.name);
  // Phase H: POST /themes {name: theme.name, token_map}; else saveCustomThemes fallback
  ```

## Task 4 — Mount

Reachable from the appearance entry point (same nav surface as Theme Builder, Phase F). Reuse the
app's existing route/modal pattern.

---

## Acceptance

- Grid renders 6 seed cards with correct palettes + install counts; search + filter chips work.
- Install merges tokens → app restyles immediately; button flips to Installed; reload keeps it
  (via custom-theme persistence). No hardcoded chrome hex (palette swatches excepted). `npm run build` clean.
