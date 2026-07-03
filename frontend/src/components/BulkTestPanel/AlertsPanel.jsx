import { useState } from 'react';
import { useAuth } from '../../store/session';
import {
  useGetScheduleAlertsQuery,
  useCreateScheduleAlertMutation,
  useUpdateScheduleAlertMutation,
  useDeleteScheduleAlertMutation,
} from '../../store/apiSlice';
import styles from './AlertsPanel.module.css';

const EMPTY_FORM = { type: 'webhook', target: '', on_failure: true, on_success: false, on_partial: true };

function AlertForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className={styles.form}>
      <div className={styles.formRow}>
        <label className={styles.label}>Type</label>
        <select className={styles.select} value={form.type} onChange={e => set('type', e.target.value)}>
          <option value="webhook">Webhook (Slack / generic)</option>
          <option value="email">Email</option>
        </select>
      </div>
      <div className={styles.formRow}>
        <label className={styles.label}>{form.type === 'email' ? 'Email address' : 'Webhook URL'}</label>
        <input
          className={styles.input}
          value={form.target}
          onChange={e => set('target', e.target.value)}
          placeholder={form.type === 'email' ? 'user@example.com' : 'https://hooks.slack.com/...'}
        />
      </div>
      <div className={styles.checkboxRow}>
        <label><input type="checkbox" checked={form.on_failure} onChange={e => set('on_failure', e.target.checked)} /> On failure</label>
        <label><input type="checkbox" checked={form.on_partial} onChange={e => set('on_partial', e.target.checked)} /> On partial</label>
        <label><input type="checkbox" checked={form.on_success} onChange={e => set('on_success', e.target.checked)} /> On success</label>
      </div>
      <div className={styles.formActions}>
        <button className={styles.cancelBtn} onClick={onCancel} disabled={saving}>Cancel</button>
        <button className={styles.saveBtn} onClick={() => onSave(form)} disabled={saving || !form.target.trim()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export default function AlertsPanel({ scheduleId }) {
  const { user } = useAuth();
  const username = user?.email || user?.username || '';

  const { data: alerts = [], isLoading } = useGetScheduleAlertsQuery(
    { scheduleId, username },
    { skip: !scheduleId || !username }
  );
  const [createAlert, { isLoading: creating }] = useCreateScheduleAlertMutation();
  const [updateAlert, { isLoading: updating }] = useUpdateScheduleAlertMutation();
  const [deleteAlert] = useDeleteScheduleAlertMutation();

  const [showForm, setShowForm] = useState(false);
  const [editingAlert, setEditingAlert] = useState(null);
  const [error, setError] = useState(null);

  const handleCreate = async form => {
    setError(null);
    try {
      await createAlert({ scheduleId, username, ...form }).unwrap();
      setShowForm(false);
    } catch (e) {
      setError(e?.data?.error_message || 'Failed to create alert');
    }
  };

  const handleUpdate = async form => {
    setError(null);
    try {
      await updateAlert({ scheduleId, alertId: editingAlert.id, username, ...form }).unwrap();
      setEditingAlert(null);
    } catch (e) {
      setError(e?.data?.error_message || 'Failed to update alert');
    }
  };

  const handleDelete = async alertId => {
    setError(null);
    try {
      await deleteAlert({ scheduleId, alertId, username }).unwrap();
    } catch (e) {
      setError('Failed to delete alert');
    }
  };

  if (isLoading) return <div className={styles.empty}>Loading alerts…</div>;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Alerts</span>
        {!showForm && !editingAlert && (
          <button className={styles.addBtn} onClick={() => setShowForm(true)}>+ Add Alert</button>
        )}
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {showForm && (
        <AlertForm onSave={handleCreate} onCancel={() => setShowForm(false)} saving={creating} />
      )}

      {alerts.length === 0 && !showForm && (
        <div className={styles.empty}>No alerts configured. Add one to get notified on test completion.</div>
      )}

      {alerts.map(alert => (
        editingAlert?.id === alert.id ? (
          <AlertForm
            key={alert.id}
            initial={alert}
            onSave={handleUpdate}
            onCancel={() => setEditingAlert(null)}
            saving={updating}
          />
        ) : (
          <div key={alert.id} className={styles.alertRow}>
            <div className={styles.alertInfo}>
              <span className={`${styles.typeBadge} ${styles[alert.type]}`}>{alert.type}</span>
              <span className={styles.target} title={alert.target}>{alert.target}</span>
              <span className={styles.conditions}>
                {[alert.on_failure && 'failure', alert.on_partial && 'partial', alert.on_success && 'success']
                  .filter(Boolean).join(' · ')}
              </span>
            </div>
            <div className={styles.alertActions}>
              <button className={styles.editBtn} onClick={() => setEditingAlert(alert)}>Edit</button>
              <button className={styles.deleteBtn} onClick={() => handleDelete(alert.id)}>×</button>
            </div>
          </div>
        )
      ))}
    </div>
  );
}
