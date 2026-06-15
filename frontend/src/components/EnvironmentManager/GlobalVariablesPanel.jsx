import { useState } from 'react';
import {
  useGetGlobalVariablesQuery,
  useUpsertGlobalVariablesMutation,
  useDeleteGlobalVariableMutation,
} from '../../store/apiSlice';
import styles from './GlobalVariablesPanel.module.css';

export default function GlobalVariablesPanel() {
  const { data: serverVars = [], isLoading } = useGetGlobalVariablesQuery();
  const [upsert, { isLoading: saving }] = useUpsertGlobalVariablesMutation();
  const [deleteVar] = useDeleteGlobalVariableMutation();

  // Local editable state: [{key, value, is_secret}]
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  // Initialise rows from server on first load (only once)
  const displayRows = rows !== null
    ? rows
    : serverVars.map(v => ({ key: v.key, value: v.is_secret ? '' : v.value, is_secret: v.is_secret }));

  const getRows = () => (rows !== null ? rows : displayRows);

  const updateRow = (idx, field, val) => {
    const next = getRows().map((r, i) => i === idx ? { ...r, [field]: val } : r);
    setRows(next);
  };

  const addRow = () => {
    setRows([...getRows(), { key: '', value: '', is_secret: false }]);
  };

  const removeRow = async idx => {
    const current = getRows();
    const key = current[idx].key;
    if (key) {
      await deleteVar(key);
    }
    setRows(current.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setError(null);
    const toSave = getRows().filter(r => r.key.trim());
    try {
      await upsert(toSave.map(r => ({
        key: r.key.trim(),
        value: r.value,
        is_secret: r.is_secret,
      }))).unwrap();
      setRows(null); // reset — reload from server
    } catch (e) {
      setError('Failed to save. Please try again.');
    }
  };

  if (isLoading) return <div className={styles.emptyState}>Loading...</div>;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Global Variables</span>
        <button className={styles.addBtn} onClick={addRow}>+ Add</button>
      </div>

      <div className={styles.list}>
        {displayRows.length === 0 && rows === null && (
          <div className={styles.emptyState}>No global variables yet.</div>
        )}
        {(rows !== null ? rows : displayRows).map((row, idx) => (
          <div key={idx} className={styles.row}>
            <input
              className={styles.keyInput}
              placeholder="Variable name"
              value={row.key}
              onChange={e => updateRow(idx, 'key', e.target.value)}
            />
            <input
              className={styles.valueInput}
              placeholder="Value"
              type={row.is_secret ? 'password' : 'text'}
              value={row.value}
              onChange={e => updateRow(idx, 'value', e.target.value)}
            />
            <button className={styles.deleteBtn} onClick={() => removeRow(idx)} title="Delete">×</button>
          </div>
        ))}
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.saveBar}>
        <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save All'}
        </button>
      </div>
    </div>
  );
}
