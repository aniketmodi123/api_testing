import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiSearch, FiShoppingBag, FiX } from 'react-icons/fi';
import { MARKETPLACE_THEMES } from '../../data/marketplaceThemes.js';
import { loadCustomThemes, saveCustomThemes } from '../../themes/customTheme.js';
import ThemeCard from './ThemeCard.jsx';
import styles from './Marketplace.module.css';

// Filter chips, in display order. 'popular' / 'newest' sort the full list; 'dark' /
// 'light' filter by the card's tag (mockup's Dark/Light chips map to the seed `tag`
// field — Warm/Cool themes stay visible under both Popular and Newest).
const FILTERS = [
  { id: 'popular', label: 'Popular' },
  { id: 'newest', label: 'Newest' },
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
];

export default function Marketplace({ preferences, setPreference, onClose }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('popular');
  const [installedNames, setInstalledNames] = useState(
    () => new Set(loadCustomThemes().map((t) => t.name)),
  );
  const panelRef = useRef(null);

  // Close on Escape, matching ThemeBuilder's keyboard contract.
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Close on outside click, matching ThemePanel's contract.
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const visibleThemes = useMemo(() => {
    let list = MARKETPLACE_THEMES;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q) || t.author.toLowerCase().includes(q));
    }
    if (filter === 'dark') list = list.filter((t) => t.tag === 'Dark');
    else if (filter === 'light') list = list.filter((t) => t.tag === 'Light');

    list = [...list];
    if (filter === 'newest') list.reverse(); // seed list has no real timestamps — reverse seed order as a stand-in
    else list.sort((a, b) => b.installs - a.installs); // 'popular' (default) and the dark/light filters both rank by installs

    return list;
  }, [query, filter]);

  // Install merges the card's token_map into :root for an immediate restyle, then
  // persists it as a named custom theme — the same storage CustomThemeEditor/
  // ThemeBuilder write to, so it survives reload and shows up in the Custom tab too.
  // Phase H will swap saveCustomThemes() for POST /themes; the localStorage write stays
  // as the logged-out fallback either way.
  const handleInstall = useCallback((theme) => {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(theme.token_map)) root.style.setProperty(k, v);

    const themes = loadCustomThemes();
    const existingIdx = themes.findIndex((t) => t.name === theme.name);
    const entry = { name: theme.name, token_map: theme.token_map, created_at: new Date().toISOString() };
    if (existingIdx >= 0) themes[existingIdx] = entry;
    else themes.push(entry);
    saveCustomThemes(themes);

    setPreference('customTheme', theme.name);
    setInstalledNames((prev) => new Set(prev).add(theme.name));
  }, [setPreference]);

  return (
    <div className={styles.overlay}>
      <div className={styles.panel} ref={panelRef}>
        <div className={styles.header}>
          <FiShoppingBag className={styles.headerIcon} />
          <span className={styles.headerTitle}>Marketplace</span>

          <div className={styles.searchBox}>
            <FiSearch className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search themes"
              aria-label="Search themes"
            />
          </div>

          <div className={styles.filters}>
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`${styles.filterChip} ${filter === f.id ? styles.filterChipActive : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close marketplace">
            <FiX />
          </button>
        </div>

        <div className={styles.body}>
          {visibleThemes.length === 0 ? (
            <div className={styles.empty}>No themes match &quot;{query}&quot;.</div>
          ) : (
            <div className={styles.grid}>
              {visibleThemes.map((theme) => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  isInstalled={installedNames.has(theme.name) || preferences?.customTheme === theme.name}
                  onInstall={handleInstall}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
