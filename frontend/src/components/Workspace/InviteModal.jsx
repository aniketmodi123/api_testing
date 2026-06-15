import { useState } from 'react';
import styles from './Workspace.module.css';

export default function InviteModal({ workspaceId, onClose, onInvited }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const token = localStorage.getItem('token');
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const API_BASE = import.meta.env.VITE_API_BASE || 'https://api-testing-2vjt.onrender.com';
      const res = await fetch(`${API_BASE}/workspace/${workspaceId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token?.startsWith('Bearer ') ? token : `Bearer ${token}`,
          username: user.email || '',
        },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const data = await res.json();
      if (data.response_code >= 200 && data.response_code < 300) {
        setSuccess(`Invitation sent to ${email.trim()}`);
        setEmail('');
        onInvited?.();
      } else {
        setError(data.error_message || 'Failed to send invitation');
      }
    } catch (err) {
      setError('Network error — could not send invitation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3>Invite Member</h3>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.inviteForm}>
          <label className={styles.label}>Email address</label>
          <input
            type="email"
            className={styles.input}
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="colleague@example.com"
            required
            autoFocus
          />
          <label className={styles.label}>Role</label>
          <select className={styles.select} value={role} onChange={e => setRole(e.target.value)}>
            <option value="viewer">Viewer — read-only, can run tests</option>
            <option value="editor">Editor — full CRUD on APIs and cases</option>
            <option value="admin">Admin — editor + can invite others</option>
          </select>
          {error && <p className={styles.errorMsg}>{error}</p>}
          {success && <p className={styles.successMsg}>{success}</p>}
          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.primaryBtn} disabled={loading || !email.trim()}>
              {loading ? 'Sending…' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
