import { useEffect, useState } from 'react';
import {
  useDeleteCollectionVariableMutation,
  useGetCollectionVariablesQuery,
  useUpsertCollectionVariablesMutation,
} from '../../store/apiSlice';
import { headerService } from '../../services/headerService';
import styles from './NodeDetailPanel.module.css';

// ─── Variable tab ────────────────────────────────────────────────────────────

function emptyRow() {
  return { key: '', value: '', is_secret: false, _id: `new-${Date.now()}-${Math.random()}` };
}

function SecretInput({ value, onChange, placeholder }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className={styles.secretWrap}>
      <input
        type={revealed ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={styles.cellInput}
        autoComplete="off"
      />
      <button type="button" className={styles.revealBtn} onClick={() => setRevealed(r => !r)}>
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

function VariablesTab({ node }) {
  const nodeId = node?.id;
  const { data: serverVars = [], isLoading } = useGetCollectionVariablesQuery(nodeId, { skip: !nodeId });
  const [upsert, { isLoading: saving }] = useUpsertCollectionVariablesMutation();
  const [deleteVar] = useDeleteCollectionVariableMutation();

  const [rows, setRows] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState('');
  const [saveError, setSaveError] = useState(null);

  const [lastNodeId, setLastNodeId] = useState(nodeId);
  if (nodeId !== lastNodeId) {
    setLastNodeId(nodeId);
    setRows(null);
    setDirty(false);
    setSearch('');
    setSaveError(null);
  }

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
        r.value.toLowerCase().includes(search.toLowerCase()))
    : activeRows;

  const updateRow = (_id, field, val) => {
    setRows(activeRows.map(r => r._id === _id ? { ...r, [field]: val } : r));
    setDirty(true);
  };

  const addRow = () => { setRows([...activeRows, emptyRow()]); setDirty(true); };

  const removeRow = async _id => {
    const row = activeRows.find(r => r._id === _id);
    if (row?.key && !row._id.startsWith('new-')) await deleteVar({ nodeId, key: row.key });
    setRows(activeRows.filter(r => r._id !== _id));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaveError(null);
    try {
      await upsert({
        nodeId,
        variables: activeRows.filter(r => r.key.trim()).map(r => ({
          key: r.key.trim(), value: r.value, is_secret: r.is_secret,
        })),
      }).unwrap();
      setRows(null);
      setDirty(false);
    } catch {
      setSaveError('Failed to save. Please try again.');
    }
  };

  const handleDiscard = () => { setRows(null); setDirty(false); setSaveError(null); };

  if (isLoading) return <div className={styles.tabLoading}>Loading variables…</div>;

  return (
    <div className={styles.tabContent}>
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
          {search && <button className={styles.clearSearch} onClick={() => setSearch('')} type="button">×</button>}
        </div>
        <button className={styles.addBtn} onClick={addRow} type="button">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          Add
        </button>
        {dirty && (
          <>
            <button className={styles.discardBtn} onClick={handleDiscard} type="button">Discard</button>
            <button className={styles.saveBtn} onClick={handleSave} disabled={saving} type="button">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
      </div>

      {saveError && <div className={styles.saveError}>{saveError}</div>}

      {node?.type === 'folder' && (
        <div className={styles.inheritanceBanner}>
          Variables on this folder are inherited by all child folders and requests.
        </div>
      )}

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
              <tr><td colSpan={4} className={styles.empty}>
                {search ? `No variables matching "${search}"` : 'No variables yet. Click Add to create one.'}
              </td></tr>
            )}
            {filtered.map(row => (
              <tr key={row._id} className={styles.row}>
                <td className={styles.td}>
                  <input className={styles.cellInput} value={row.key}
                    onChange={e => updateRow(row._id, 'key', e.target.value)}
                    placeholder="variable_name" spellCheck={false} />
                </td>
                <td className={styles.td}>
                  {row.is_secret
                    ? <SecretInput value={row.value} onChange={e => updateRow(row._id, 'value', e.target.value)} placeholder="secret value" />
                    : <input className={styles.cellInput} value={row.value}
                        onChange={e => updateRow(row._id, 'value', e.target.value)}
                        placeholder="value" spellCheck={false} />
                  }
                </td>
                <td className={styles.td} style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={!!row.is_secret}
                    onChange={e => updateRow(row._id, 'is_secret', e.target.checked)} />
                </td>
                <td className={styles.td}>
                  <button className={styles.deleteRowBtn} onClick={() => removeRow(row._id)} type="button">
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

      <div className={styles.footer}>
        {activeRows.filter(r => r.key.trim()).length} variable{activeRows.filter(r => r.key.trim()).length !== 1 ? 's' : ''}
        {search && filtered.length !== activeRows.length && ` · ${filtered.length} shown`}
      </div>
    </div>
  );
}

// ─── Headers tab ─────────────────────────────────────────────────────────────

function HeadersTab({ node }) {
  const [headers, setHeaders] = useState({});
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!node?.id) return;
    setLoading(true);
    setError(null);
    headerService.getHeaders(node.id)
      .then(res => setHeaders(res?.data?.content ?? {}))
      .catch(() => setError('Failed to load headers.'))
      .finally(() => setLoading(false));
    setDirty(false);
    setNewKey('');
    setNewVal('');
  }, [node?.id]);

  const addHeader = () => {
    if (!newKey.trim()) return;
    setHeaders(h => ({ ...h, [newKey.trim()]: newVal }));
    setNewKey('');
    setNewVal('');
    setDirty(true);
  };

  const removeHeader = key => {
    setHeaders(h => { const n = { ...h }; delete n[key]; return n; });
    setDirty(true);
  };

  const updateVal = (key, val) => {
    setHeaders(h => ({ ...h, [key]: val }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (Object.keys(headers).length === 0) {
        await headerService.deleteHeaders(node.id);
      } else {
        const existing = await headerService.getHeaders(node.id);
        if (existing?.data?.id) {
          await headerService.updateHeaders(node.id, headers);
        } else {
          await headerService.setHeaders(node.id, headers);
        }
      }
      setDirty(false);
    } catch {
      setError('Failed to save headers.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className={styles.tabLoading}>Loading headers…</div>;

  return (
    <div className={styles.tabContent}>
      {error && <div className={styles.saveError}>{error}</div>}

      {node?.type === 'folder' && (
        <div className={styles.inheritanceBanner}>
          Headers set here are automatically applied to all requests in this folder and subfolders.
        </div>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th} style={{ width: '40%' }}>Header</th>
              <th className={styles.th} style={{ width: '50%' }}>Value</th>
              <th className={styles.th} style={{ width: '10%' }} />
            </tr>
          </thead>
          <tbody>
            {Object.keys(headers).length === 0 && (
              <tr><td colSpan={3} className={styles.empty}>No headers. Add one below.</td></tr>
            )}
            {Object.entries(headers).map(([key, val]) => (
              <tr key={key} className={styles.row}>
                <td className={styles.td}>
                  <span className={styles.cellMono}>{key}</span>
                </td>
                <td className={styles.td}>
                  <input className={styles.cellInput} value={val}
                    onChange={e => updateVal(key, e.target.value)} spellCheck={false} />
                </td>
                <td className={styles.td}>
                  <button className={styles.deleteRowBtn} onClick={() => removeHeader(key)} type="button">
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

      {/* Add row */}
      <div className={styles.addHeaderRow}>
        <input className={styles.cellInput} value={newKey}
          onChange={e => setNewKey(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addHeader()}
          placeholder="Header-Name" spellCheck={false} />
        <input className={styles.cellInput} value={newVal}
          onChange={e => setNewVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addHeader()}
          placeholder="value" spellCheck={false} />
        <button className={styles.addBtn} onClick={addHeader} disabled={!newKey.trim()} type="button">Add</button>
      </div>

      <div className={styles.footer}>
        {Object.keys(headers).length} header{Object.keys(headers).length !== 1 ? 's' : ''}
        {dirty && (
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving} style={{ marginLeft: 'auto' }} type="button">
            {saving ? 'Saving…' : 'Save Headers'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'variables', label: 'Variables' },
  { id: 'headers', label: 'Headers' },
];

export default function NodeDetailPanel({ node }) {
  const [activeTab, setActiveTab] = useState('variables');

  // Reset tab when node changes
  const [lastId, setLastId] = useState(node?.id);
  if (node?.id !== lastId) {
    setLastId(node?.id);
    setActiveTab('variables');
  }

  if (!node) return null;

  const nodeTypeLabel = node.type === 'folder' ? 'Folder' : 'Request';
  const icon = node.type === 'folder' ? '📁' : null;

  return (
    <div className={styles.panel}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {icon && <span className={styles.nodeIcon}>{icon}</span>}
          <span className={styles.nodeName}>{node.name}</span>
          <span className={styles.nodeTypeBadge}>{nodeTypeLabel}</span>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className={styles.tabBar}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {activeTab === 'variables' && <VariablesTab node={node} />}
      {activeTab === 'headers' && <HeadersTab node={node} />}
    </div>
  );
}
