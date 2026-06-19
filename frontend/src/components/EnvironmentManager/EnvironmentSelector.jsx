import { useEffect, useRef, useState } from 'react';
import styles from './EnvironmentSelector.module.css';

export default function EnvironmentSelector({
  environments,
  activeEnvironment,
  selectedEnvironment,
  onSelectEnvironment,
  onActivateEnvironment,
  onDeleteEnvironment,
  onDuplicateEnvironment,
  onRenameEnvironment,
  isLoading,
}) {
  const [menuFor, setMenuFor] = useState(null); // env.id whose context menu is open
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const menuRef = useRef(null);
  const renameRef = useRef(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuFor) return;
    const handler = e => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuFor(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuFor]);

  // Focus rename input
  useEffect(() => {
    if (renamingId && renameRef.current) renameRef.current.focus();
  }, [renamingId]);

  const openMenu = (e, env) => {
    e.stopPropagation();
    setMenuFor(prev => (prev === env.id ? null : env.id));
  };

  const startRename = env => {
    setMenuFor(null);
    setRenamingId(env.id);
    setRenameVal(env.name);
  };

  const commitRename = async env => {
    const trimmed = renameVal.trim();
    if (trimmed && trimmed !== env.name) {
      if (onRenameEnvironment) await onRenameEnvironment(env.id, trimmed);
    }
    setRenamingId(null);
  };

  const handleRenameKey = (e, env) => {
    if (e.key === 'Enter') commitRename(env);
    if (e.key === 'Escape') setRenamingId(null);
  };

  return (
    <div className={styles.environmentSelector}>
      {environments.map(env => {
        const isSelected = selectedEnvironment?.id === env.id;
        const isActive = activeEnvironment?.id === env.id;
        const isRenaming = renamingId === env.id;

        return (
          <div
            key={env.id}
            className={`${styles.envRow} ${isSelected ? styles.selected : ''}`}
            onClick={() => !isRenaming && onSelectEnvironment(env)}
          >
            {/* Active indicator dot */}
            <span
              className={`${styles.activeDot} ${isActive ? styles.activeDotOn : ''}`}
              title={isActive ? 'Active environment' : 'Inactive'}
            />

            {/* Name or rename input */}
            {isRenaming ? (
              <input
                ref={renameRef}
                className={styles.renameInput}
                value={renameVal}
                onChange={e => setRenameVal(e.target.value)}
                onBlur={() => commitRename(env)}
                onKeyDown={e => handleRenameKey(e, env)}
                onClick={e => e.stopPropagation()}
                maxLength={100}
              />
            ) : (
              <span className={styles.envName} title={env.name}>{env.name}</span>
            )}

            {/* Active badge — only on active env when not selected (selected shows in detail) */}
            {isActive && !isSelected && (
              <span className={styles.activeBadge}>active</span>
            )}

            {/* 3-dot menu trigger */}
            <button
              className={styles.menuTrigger}
              onClick={e => openMenu(e, env)}
              title="Environment options"
              type="button"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="8" cy="3" r="1.3"/>
                <circle cx="8" cy="8" r="1.3"/>
                <circle cx="8" cy="13" r="1.3"/>
              </svg>
            </button>

            {/* Context menu */}
            {menuFor === env.id && (
              <div className={styles.menu} ref={menuRef} onClick={e => e.stopPropagation()}>
                {!isActive && (
                  <button
                    className={styles.menuItem}
                    onClick={() => { setMenuFor(null); onActivateEnvironment(env.id); }}
                    disabled={isLoading}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2L15.09 8.26L22 9L17 14L18.18 21L12 17.77L5.82 21L7 14L2 9L8.91 8.26L12 2Z" fill="currentColor"/>
                    </svg>
                    Set as Active
                  </button>
                )}
                <button
                  className={styles.menuItem}
                  onClick={() => startRename(env)}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Rename
                </button>
                <button
                  className={styles.menuItem}
                  onClick={() => { setMenuFor(null); onDuplicateEnvironment && onDuplicateEnvironment(env); }}
                  disabled={isLoading}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                  Duplicate
                </button>
                <div className={styles.menuDivider} />
                <button
                  className={`${styles.menuItem} ${styles.menuItemDelete}`}
                  onClick={() => { setMenuFor(null); onDeleteEnvironment(env); }}
                  disabled={isLoading}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Delete
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
