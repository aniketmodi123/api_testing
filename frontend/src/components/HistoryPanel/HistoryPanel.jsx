import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import MethodBadge from '../MethodBadge/MethodBadge';
import styles from './HistoryPanel.module.css';

function formatTime(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleString();
  } catch {
    return isoString;
  }
}

function statusClass(status) {
  if (!status) return '';
  if (status < 300) return styles.success;
  if (status < 400) return styles.info;
  if (status < 500) return styles.warning;
  return styles.error;
}

export default function HistoryPanel({ onSelectRequest }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fileIdFilter, setFileIdFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 50 };
      if (fileIdFilter) params.file_id = fileIdFilter;
      const res = await api.get('/history', { params });
      setEntries(res.data?.data ?? res.data ?? []);
    } catch (err) {
      console.error('Failed to load history', err);
    } finally {
      setLoading(false);
    }
  }, [fileIdFilter]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    try {
      await api.delete(`/history/${id}`);
      setEntries(prev => prev.filter(h => h.id !== id));
    } catch (err) {
      console.error('Failed to delete history entry', err);
    }
  };

  const handleReplay = entry => {
    if (!onSelectRequest) return;
    // Reconstruct a minimal node-like object from history for replay
    onSelectRequest({
      id: entry.file_id,
      type: 'file',
      name: entry.url,
      method: entry.method,
      _historyReplay: {
        method: entry.method,
        url: entry.url,
        headers: entry.headers || {},
        params: entry.params || {},
        body: entry.body,
      },
    });
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>History</span>
        <button className={styles.refreshBtn} onClick={load} title="Refresh">↻</button>
      </div>

      {loading && <div className={styles.loading}>Loading...</div>}

      {!loading && entries.length === 0 && (
        <div className={styles.empty}>No history yet. Make an API call to start.</div>
      )}

      <div className={styles.list}>
        {entries.map(entry => (
          <div key={entry.id} className={styles.item} onClick={() => handleReplay(entry)}>
            <div className={styles.itemTop}>
              <MethodBadge method={entry.method} size="sm" />
              <span className={styles.url} title={entry.url}>{entry.url}</span>
            </div>
            <div className={styles.itemMeta}>
              <span className={`${styles.status} ${statusClass(entry.response_status)}`}>
                {entry.response_status ?? '—'}
              </span>
              <span className={styles.time}>{entry.execution_time_ms ?? 0}ms</span>
              <span className={styles.date}>{formatTime(entry.created_at)}</span>
              <button
                className={styles.deleteBtn}
                onClick={e => handleDelete(entry.id, e)}
                title="Delete"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
