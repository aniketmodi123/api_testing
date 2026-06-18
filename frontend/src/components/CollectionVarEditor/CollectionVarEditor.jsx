import { useState } from 'react';
import {
  useGetCollectionVariablesQuery,
  useUpsertCollectionVariablesMutation,
  useDeleteCollectionVariableMutation,
  useRevealCollectionVariableMutation,
} from '../../store/apiSlice';
import styles from './CollectionVarEditor.module.css';

const KEY_RE = /^[a-zA-Z0-9_-]+$/;

export default function CollectionVarEditor({ nodeId, readonly = false }) {
  const { data: serverVars = [], isLoading } = useGetCollectionVariablesQuery(nodeId, { skip: !nodeId });
  const [upsert, { isLoading: saving }] = useUpsertCollectionVariablesMutation();
  const [deleteVar] = useDeleteCollectionVariableMutation();
  const [reveal] = useRevealCollectionVariableMutation();

  const [rows, setRows] = useState(null);
  const [revealed, setRevealed] = useState({});
  const [error, setError] = useState(null);
  const [keyErrors, setKeyErrors] = useState({});

  const serverRows = serverVars.map(v => ({
    key: v.key,
    value: v.is_secret ? '' : v.value,
    is_secret: v.is_secret,
    description: v.description || '',
  }));

  const displayRows = rows !== null ? rows : serverRows;

  const updateRow = (idx, field, val) => {
    const next = displayRows.map((r, i) => i === idx ? { ...r, [field]: val } : r);
    setRows(next);
    if (field === 'key') {
      setKeyErrors(prev => ({ ...prev, [idx]: val && !KEY_RE.test(val) ? 'Only letters, numbers, _ and - allowed' : null }));
    }
  };

  const addRow = () => setRows([...displayRows, { key: '', value: '', is_secret: false, description: '' }]);

  const removeRow = async idx => {
    const key = displayRows[idx].key;
    if (key) await deleteVar({ nodeId, key });
    setRows(displayRows.filter((_, i) => i !== idx));
  };

  const handleReveal = async (idx, key) => {
    try {
      const res = await reveal({ nodeId, key }).unwrap();
      setRevealed(prev => ({ ...prev, [idx]: res.value }));
    } catch {
      setError('Failed to reveal secret value.');
    }
  };

  const handleSave = async () => {
    setError(null);
    const toSave = displayRows.filter(r => r.key.trim());
    const invalid = toSave.find(r => !KEY_RE.test(r.key));
    if (invalid) {
      setError(`Invalid key "${invalid.key}". Only letters, numbers, _ and - allowed.`);
      return;
    }
    try {
      await upsert({ nodeId, variables: toSave.map(r => ({
        key: r.key.trim(),
        value: r.value,
        is_secret: r.is_secret,
        description: r.description || null,
      })) }).unwrap();
      setRows(null);
      setRevealed({});
    } catch {
      setError('Failed to save. Please try again.');
    }
  };

  if (isLoading) return <div className={styles.empty}>Loading...</div>;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Collection Variables</span>
        <span className={styles.hint}>Scope: this node and descendants</span>
        {!readonly && <button className={styles.addBtn} onClick={addRow}>+ Add</button>}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Key</th>
              <th>Value</th>
              <th>Secret</th>
              {!readonly && <th></th>}
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 && (
              <tr><td colSpan={readonly ? 3 : 4} className={styles.empty}>No variables yet.</td></tr>
            )}
            {displayRows.map((row, idx) => (
              <tr key={idx} className={styles.row}>
                <td>
                  <input
                    className={`${styles.input} ${keyErrors[idx] ? styles.inputError : ''}`}
                    value={row.key}
                    placeholder="variable_name"
                    onChange={e => updateRow(idx, 'key', e.target.value)}
                    readOnly={readonly}
                    spellCheck={false}
                  />
                  {keyErrors[idx] && <div className={styles.fieldError}>{keyErrors[idx]}</div>}
                </td>
                <td className={styles.valueCell}>
                  <input
                    className={styles.input}
                    value={revealed[idx] !== undefined ? revealed[idx] : row.value}
                    placeholder={row.is_secret ? '••••••••' : 'value'}
                    type={row.is_secret && revealed[idx] === undefined ? 'password' : 'text'}
                    onChange={e => updateRow(idx, 'value', e.target.value)}
                    readOnly={readonly}
                    spellCheck={false}
                  />
                  {row.is_secret && (
                    <button
                      className={styles.revealBtn}
                      title={revealed[idx] !== undefined ? 'Hide' : 'Reveal'}
                      onClick={() => {
                        if (revealed[idx] !== undefined) {
                          setRevealed(prev => { const n = { ...prev }; delete n[idx]; return n; });
                        } else {
                          handleReveal(idx, row.key);
                        }
                      }}
                    >
                      {revealed[idx] !== undefined ? '🙈' : '👁'}
                    </button>
                  )}
                </td>
                <td className={styles.secretCell}>
                  <input
                    type="checkbox"
                    checked={row.is_secret}
                    onChange={e => updateRow(idx, 'is_secret', e.target.checked)}
                    disabled={readonly}
                    title="Mark as secret"
                  />
                </td>
                {!readonly && (
                  <td>
                    <button className={styles.deleteBtn} onClick={() => removeRow(idx)} title="Delete">×</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {!readonly && (
        <div className={styles.footer}>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Variables'}
          </button>
        </div>
      )}
    </div>
  );
}
