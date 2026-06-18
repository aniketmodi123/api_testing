import { useMemo, useState, useEffect } from 'react';
import {
  useGetGlobalVariablesQuery,
  useGetCollectionVariablesQuery,
  useGetEnvironmentsQuery,
  useGetEnvironmentVariablesQuery,
} from '../../store/apiSlice';
import styles from './VariableScopePanel.module.css';

const SCOPE_ORDER = ['global', 'collection', 'environment', 'local'];

const SCOPE_META = {
  global:      { label: 'Global',      color: '#f59e0b' },
  collection:  { label: 'Collection',  color: '#10b981' },
  environment: { label: 'Environment', color: '#0ea5e9' },
  local:       { label: 'Local',       color: '#8b5cf6' },
};

export default function VariableScopePanel({ nodeId, workspaceId, open, onClose }) {
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState('all');

  const { data: globals = [] }        = useGetGlobalVariablesQuery();
  const { data: collectionVars = [] } = useGetCollectionVariablesQuery(nodeId, { skip: !nodeId });
  const { data: environments = [] }   = useGetEnvironmentsQuery(workspaceId, { skip: !workspaceId });

  const activeEnv = environments.find(e => e.is_active);
  const { data: envVarMap = {} } = useGetEnvironmentVariablesQuery(
    { workspaceId, environmentId: activeEnv?.id },
    { skip: !workspaceId || !activeEnv?.id },
  );

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Flat resolved list — higher priority scope overwrites lower
  const rows = useMemo(() => {
    const map = {};

    for (const g of globals) {
      map[g.key] = { variable: g.key, value: g.is_secret ? '••••••' : g.value, scope: 'global' };
    }
    for (const c of collectionVars) {
      map[c.key] = { variable: c.key, value: c.is_secret ? '••••••' : c.value, scope: 'collection' };
    }
    for (const [key, val] of Object.entries(envVarMap)) {
      map[key] = { variable: key, value: val, scope: 'environment' };
    }

    return Object.values(map).sort((a, b) => a.variable.localeCompare(b.variable));
  }, [globals, collectionVars, envVarMap]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => {
      if (scopeFilter !== 'all' && r.scope !== scopeFilter) return false;
      if (q && !r.variable.toLowerCase().includes(q) && !r.value.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, scopeFilter]);

  const counts = useMemo(() => {
    const c = { all: rows.length };
    for (const s of SCOPE_ORDER) c[s] = rows.filter(r => r.scope === s).length;
    return c;
  }, [rows]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={onClose} />

      {/* Drawer */}
      <div className={styles.drawer}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.title}>Variable Scope</span>
            {activeEnv && (
              <span className={styles.envChip}>
                <span className={styles.envDot} />
                {activeEnv.name}
              </span>
            )}
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Scope filter tabs */}
        <div className={styles.filterRow}>
          <button
            className={`${styles.filterBtn} ${scopeFilter === 'all' ? styles.filterActive : ''}`}
            onClick={() => setScopeFilter('all')}
          >
            All <span className={styles.count}>{counts.all}</span>
          </button>
          {SCOPE_ORDER.map(s => counts[s] > 0 && (
            <button
              key={s}
              className={`${styles.filterBtn} ${scopeFilter === s ? styles.filterActive : ''}`}
              style={scopeFilter === s ? { color: SCOPE_META[s].color, borderBottomColor: SCOPE_META[s].color } : {}}
              onClick={() => setScopeFilter(s)}
            >
              {SCOPE_META[s].label} <span className={styles.count}>{counts[s]}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className={styles.searchWrap}>
          <svg className={styles.searchIcon} width="13" height="13" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            className={styles.search}
            placeholder="Search variables…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className={styles.clearSearch} onClick={() => setSearch('')}>×</button>
          )}
        </div>

        {/* Table */}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th} style={{ width: '35%' }}>Variable</th>
                <th className={styles.th} style={{ width: '45%' }}>Value</th>
                <th className={styles.th} style={{ width: '20%' }}>Scope</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className={styles.empty}>
                    {search ? `No match for "${search}"` : 'No variables in scope.'}
                  </td>
                </tr>
              )}
              {filtered.map(r => (
                <tr key={r.variable} className={styles.row}>
                  <td className={styles.varCell} title={r.variable}>{r.variable}</td>
                  <td className={styles.valCell} title={r.value}>{r.value}</td>
                  <td className={styles.scopeCell}>
                    <span className={styles.scopeLabel} style={{ color: SCOPE_META[r.scope].color }}>
                      {SCOPE_META[r.scope].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {filtered.length} variable{filtered.length !== 1 ? 's' : ''}
          {search || scopeFilter !== 'all' ? ` (filtered from ${rows.length})` : ''}
        </div>
      </div>
    </>
  );
}
