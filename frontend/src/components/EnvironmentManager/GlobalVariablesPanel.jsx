import { useState } from 'react';
import {
  useGetGlobalVariablesQuery,
  useUpsertGlobalVariablesMutation,
  useDeleteGlobalVariableMutation,
} from '../../store/apiSlice';
import styles from './EnvironmentDetail.module.css';
import gStyles from './GlobalVariablesPanel.module.css';

function emptyRow() {
  return { key: '', value: '', is_secret: false, _id: `new-${Date.now()}-${Math.random()}` };
}

function SecretInput({ value, onChange, placeholder, disabled }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className={styles.secretWrap}>
      <input
        type={revealed ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={styles.cellInput}
        autoComplete="off"
      />
      <button
        type="button"
        className={styles.revealBtn}
        onClick={() => setRevealed(r => !r)}
        title={revealed ? 'Hide' : 'Reveal'}
      >
        {revealed ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
          </svg>
        )}
      </button>
    </div>
  );
}

export default function GlobalVariablesPanel() {
  const { data: serverVars = [], isLoading } = useGetGlobalVariablesQuery();
  const [upsert, { isLoading: saving }] = useUpsertGlobalVariablesMutation();
  const [deleteVar] = useDeleteGlobalVariableMutation();

  const [rows, setRows] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState('');
  const [saveError, setSaveError] = useState(null);

  // Seed rows from server only once (when rows is null and server data arrives)
  const serverRows = serverVars.map(v => ({
    key: v.key,
    value: v.is_secret ? '' : v.value,
    is_secret: v.is_secret,
    _id: String(v.id),
  }));

  const activeRows = rows !== null ? rows : serverRows;

  const filtered = search.trim()
    ? activeRows.filter(r =>
        r.key.toLowerCase().includes(search.toLowerCase()) ||
        r.value.toLowerCase().includes(search.toLowerCase())
      )
    : activeRows;

  const updateRow = (_id, field, val) => {
    setRows(activeRows.map(r => r._id === _id ? { ...r, [field]: val } : r));
    setDirty(true);
  };

  const addRow = () => {
    setRows([...activeRows, emptyRow()]);
    setDirty(true);
  };

  const removeRow = async _id => {
    const row = activeRows.find(r => r._id === _id);
    if (row?.key && !row._id.startsWith('new-')) {
      await deleteVar(row.key);
    }
    setRows(activeRows.filter(r => r._id !== _id));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaveError(null);
    const toSave = activeRows.filter(r => r.key.trim());
    try {
      await upsert(toSave.map(r => ({
        key: r.key.trim(),
        value: r.value,
        is_secret: r.is_secret,
      }))).unwrap();
      setRows(null);
      setDirty(false);
    } catch {
      setSaveError('Failed to save. Please try again.');
    }
  };

  const handleDiscard = () => {
    setRows(null);
    setDirty(false);
    setSaveError(null);
  };

  if (isLoading) {
    return (
      <div className={styles.detail}>
        <div className={gStyles.loadingState}>Loading global variables…</div>
      </div>
    );
  }

  return (
    <div className={styles.detail}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.envName}>Global Variables</span>
          <span className={gStyles.scopeBadge}>User · All Workspaces</span>
        </div>
        <div className={styles.headerRight}>
          {dirty && (
            <>
              <button className={styles.discardBtn} onClick={handleDiscard} type="button">
                Discard
              </button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving} type="button">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <svg className={styles.searchIcon} width="13" height="13" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            className={styles.searchInput}
            placeholder="Search variables…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className={styles.clearSearch} onClick={() => setSearch('')} type="button">×</button>
          )}
        </div>
        <button className={styles.addBtn} onClick={addRow} type="button">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          Add Variable
        </button>
      </div>

      {saveError && <div className={gStyles.saveError}>{saveError}</div>}

      {/* ── Table ── */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th} style={{ width: '35%' }}>Variable</th>
              <th className={styles.th} style={{ width: '45%' }}>Value</th>
              <th className={styles.th} style={{ width: '10%' }}>Secret</th>
              <th className={styles.th} style={{ width: '10%' }} />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className={styles.empty}>
                  {search ? `No variables matching "${search}"` : 'No global variables. Click Add Variable to create one.'}
                </td>
              </tr>
            )}
            {filtered.map(row => (
              <tr key={row._id} className={styles.row}>
                <td className={styles.td}>
                  <input
                    className={styles.cellInput}
                    value={row.key}
                    onChange={e => updateRow(row._id, 'key', e.target.value)}
                    placeholder="variable_name"
                    spellCheck={false}
                  />
                </td>
                <td className={styles.td}>
                  {row.is_secret ? (
                    <SecretInput
                      value={row.value}
                      onChange={e => updateRow(row._id, 'value', e.target.value)}
                      placeholder="secret value"
                    />
                  ) : (
                    <input
                      className={styles.cellInput}
                      value={row.value}
                      onChange={e => updateRow(row._id, 'value', e.target.value)}
                      placeholder="value"
                      spellCheck={false}
                    />
                  )}
                </td>
                <td className={styles.td} style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={!!row.is_secret}
                    onChange={e => updateRow(row._id, 'is_secret', e.target.checked)}
                    title="Mark as secret"
                  />
                </td>
                <td className={styles.td}>
                  <button
                    className={styles.deleteRowBtn}
                    onClick={() => removeRow(row._id)}
                    title="Delete variable"
                    type="button"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <path d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Footer ── */}
      <div className={styles.footer}>
        {activeRows.filter(r => r.key.trim()).length} variable{activeRows.filter(r => r.key.trim()).length !== 1 ? 's' : ''}
        {search && filtered.length !== activeRows.length && ` · ${filtered.length} shown`}
        <span className={gStyles.scopeNote}> · available in all workspaces</span>
      </div>
    </div>
  );
}
