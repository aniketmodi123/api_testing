import { useEffect, useRef, useState } from 'react';
import { useEnvironment } from '../../store/environment';
import styles from './EnvironmentDetail.module.css';

const TYPES = ['text', 'secret', 'number', 'boolean', 'json'];

const TYPE_LABELS = {
  text: 'Text',
  secret: 'Secret',
  number: 'Number',
  boolean: 'Boolean',
  json: 'JSON',
};

function TypeBadge({ type, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className={styles.typeWrap} ref={ref}>
      <button
        className={`${styles.typeBadge} ${styles[`type_${type}`]}`}
        onClick={() => !disabled && setOpen(o => !o)}
        type="button"
        title="Change variable type"
        disabled={disabled}
      >
        {TYPE_LABELS[type] || 'Text'}
        {!disabled && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ marginLeft: 3, opacity: 0.7 }}>
            <path d="M1 2.5L4 5.5L7 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>
      {open && (
        <div className={styles.typeDropdown}>
          {TYPES.map(t => (
            <button
              key={t}
              className={`${styles.typeOption} ${t === type ? styles.typeOptionActive : ''}`}
              onClick={() => { onChange(t); setOpen(false); }}
              type="button"
            >
              <span className={`${styles.typeOptionDot} ${styles[`type_${t}`]}`} />
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
        title={revealed ? 'Hide value' : 'Reveal value'}
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

function emptyRow() {
  return { key: '', value: '', initialValue: '', type: 'text', id: `new-${Date.now()}` };
}

export default function EnvironmentDetail({ environment, variables, isActive }) {
  const { updateEnvironment, activateEnvironment, saveVariables, isLoading } = useEnvironment();

  const [rows, setRows] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Name inline edit
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(environment.name);
  const nameInputRef = useRef(null);

  useEffect(() => {
    const base = variables.map(v => ({ ...v, initialValue: v.initialValue ?? v.value }));
    setRows(base);
    setDirty(false);
  }, [environment.id, variables]);

  useEffect(() => {
    setNameVal(environment.name);
    setEditingName(false);
  }, [environment.id, environment.name]);

  useEffect(() => {
    if (editingName && nameInputRef.current) nameInputRef.current.focus();
  }, [editingName]);

  const filtered = search.trim()
    ? rows.filter(r =>
        r.key.toLowerCase().includes(search.toLowerCase()) ||
        r.value.toLowerCase().includes(search.toLowerCase())
      )
    : rows;

  const handleChange = (id, field, value) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    setDirty(true);
  };

  const handleAddRow = () => {
    setRows(prev => [...prev, emptyRow()]);
    setDirty(true);
  };

  const handleDeleteRow = id => {
    setRows(prev => prev.filter(r => r.id !== id));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const validRows = rows.filter(r => r.key.trim());
      await saveVariables(environment.id, validRows);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    const base = variables.map(v => ({ ...v, initialValue: v.initialValue ?? v.value }));
    setRows(base);
    setDirty(false);
  };

  const handleSaveName = async () => {
    const trimmed = nameVal.trim();
    if (!trimmed || trimmed === environment.name) {
      setEditingName(false);
      setNameVal(environment.name);
      return;
    }
    await updateEnvironment(environment.id, { name: trimmed });
    setEditingName(false);
  };

  const handleNameKeyDown = e => {
    if (e.key === 'Enter') handleSaveName();
    if (e.key === 'Escape') { setEditingName(false); setNameVal(environment.name); }
  };

  const handleActivate = () => activateEnvironment(environment.id);

  return (
    <div className={styles.detail}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {editingName ? (
            <input
              ref={nameInputRef}
              className={styles.nameInput}
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={handleNameKeyDown}
              maxLength={100}
            />
          ) : (
            <button
              className={styles.nameBtn}
              onClick={() => setEditingName(true)}
              title="Click to rename"
              type="button"
            >
              <span className={styles.envName}>{environment.name}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className={styles.editIcon}>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}

          {isActive ? (
            <span className={styles.activeBadge}>
              <span className={styles.activeDot} />
              Active
            </span>
          ) : (
            <button className={styles.setActiveBtn} onClick={handleActivate} disabled={isLoading} type="button">
              Set as Active
            </button>
          )}
        </div>

        <div className={styles.headerRight}>
          {dirty && (
            <>
              <button className={styles.discardBtn} onClick={handleDiscard} type="button">
                Discard
              </button>
              <button
                className={styles.saveBtn}
                onClick={handleSave}
                disabled={saving}
                type="button"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Search + Add ── */}
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
        <button className={styles.addBtn} onClick={handleAddRow} type="button">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          Add Variable
        </button>
      </div>

      {/* ── Table ── */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th} style={{ width: '22%' }}>Variable</th>
              <th className={styles.th} style={{ width: '24%' }}>Initial Value</th>
              <th className={styles.th} style={{ width: '24%' }}>Current Value</th>
              <th className={styles.th} style={{ width: '14%' }}>Type</th>
              <th className={styles.th} style={{ width: '16%' }} />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  {search ? `No variables matching "${search}"` : 'No variables. Click Add Variable to create one.'}
                </td>
              </tr>
            )}
            {filtered.map(row => (
              <tr key={row.id} className={styles.row}>
                {/* Variable Name */}
                <td className={styles.td}>
                  <input
                    className={styles.cellInput}
                    value={row.key}
                    onChange={e => handleChange(row.id, 'key', e.target.value)}
                    placeholder="variable_name"
                    spellCheck={false}
                  />
                </td>

                {/* Initial Value */}
                <td className={styles.td}>
                  {row.type === 'secret' ? (
                    <SecretInput
                      value={row.initialValue ?? row.value}
                      onChange={e => handleChange(row.id, 'initialValue', e.target.value)}
                      placeholder="initial value"
                    />
                  ) : (
                    <input
                      className={styles.cellInput}
                      value={row.initialValue ?? row.value}
                      onChange={e => handleChange(row.id, 'initialValue', e.target.value)}
                      placeholder="initial value"
                      spellCheck={false}
                    />
                  )}
                </td>

                {/* Current Value */}
                <td className={styles.td}>
                  {row.type === 'secret' ? (
                    <SecretInput
                      value={row.value}
                      onChange={e => handleChange(row.id, 'value', e.target.value)}
                      placeholder="current value"
                    />
                  ) : (
                    <input
                      className={`${styles.cellInput} ${styles.currentValue}`}
                      value={row.value}
                      onChange={e => handleChange(row.id, 'value', e.target.value)}
                      placeholder="current value"
                      spellCheck={false}
                    />
                  )}
                </td>

                {/* Type */}
                <td className={styles.td}>
                  <TypeBadge
                    type={row.type || 'text'}
                    onChange={t => handleChange(row.id, 'type', t)}
                  />
                </td>

                {/* Actions */}
                <td className={styles.td}>
                  <button
                    className={styles.deleteRowBtn}
                    onClick={() => handleDeleteRow(row.id)}
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

      {/* ── Footer count ── */}
      <div className={styles.footer}>
        {rows.filter(r => r.key.trim()).length} variable{rows.filter(r => r.key.trim()).length !== 1 ? 's' : ''}
        {search && filtered.length !== rows.length && ` · ${filtered.length} shown`}
      </div>
    </div>
  );
}
