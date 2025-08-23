import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../store/session.jsx';

const ChangePassword = () => {
  const { changePassword } = useAuth();
  const navigate = useNavigate();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [validationError, setValidationError] = useState('');

  const handleChangePassword = async e => {
    e.preventDefault();
    setValidationError('');
    setError(null);
    setSuccess(false);

    if (!oldPassword) {
      setValidationError('Old password is required');
      return;
    }
    if (!newPassword) {
      setValidationError('New password is required');
      return;
    }
    if (newPassword !== confirmPassword) {
      setValidationError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const result = await changePassword(
        oldPassword,
        newPassword,
        confirmPassword
      );
      if (result && result.success) {
        setSuccess(true);
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        // Redirect to login after short delay
        setTimeout(() => {
          navigate('/signin');
        }, 1500);
      } else {
        setError(result?.message || 'Failed to change password.');
      }
    } catch (err) {
      setError('Failed to change password.');
    } finally {
      setLoading(false);
    }
  };

  const styles = {
    container: {
      maxWidth: '400px',
      margin: '0 auto',
      padding: '2rem',
    },
    title: {
      fontSize: '1.5rem',
      fontWeight: 'bold',
      marginBottom: '1.5rem',
      color: 'var(--text-color)',
      textAlign: 'center',
    },
    formSection: {
      backgroundColor: 'var(--card-bg)',
      borderRadius: '0.5rem',
      padding: '1.5rem',
      marginBottom: '1.5rem',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    },
    formGroup: {
      marginBottom: '1rem',
    },
    label: {
      display: 'block',
      marginBottom: '0.5rem',
      fontWeight: '500',
      color: 'var(--muted)',
    },
    input: {
      width: '100%',
      padding: '0.5rem',
      border: '1px solid var(--border-color)',
      borderRadius: '0.25rem',
      backgroundColor: 'var(--input)',
      color: 'var(--text-color)',
    },
    button: {
      width: '100%',
      backgroundColor: 'var(--primary)',
      color: '#fff',
      border: 'none',
      borderRadius: '0.25rem',
      padding: '0.75rem',
      cursor: 'pointer',
      fontWeight: '500',
      marginTop: '1rem',
    },
    errorMessage: {
      color: '#e53e3e',
      fontSize: '0.875rem',
      marginTop: '0.5rem',
    },
    successMessage: {
      color: '#38a169',
      fontSize: '0.875rem',
      marginTop: '0.5rem',
      textAlign: 'center',
    },
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Change Password</h1>
      <form onSubmit={handleChangePassword} style={styles.formSection}>
        <div style={styles.formGroup}>
          <label style={styles.label}>Old Password</label>
          <input
            style={styles.input}
            type="password"
            value={oldPassword}
            onChange={e => setOldPassword(e.target.value)}
            placeholder="Enter your old password"
            required
          />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>New Password</label>
          <input
            style={styles.input}
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="Enter new password"
            required
          />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Confirm New Password</label>
          <input
            style={styles.input}
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            required
          />
        </div>
        {validationError && (
          <div style={styles.errorMessage}>{validationError}</div>
        )}
        {error && <div style={styles.errorMessage}>{error}</div>}
        {success && (
          <div style={styles.successMessage}>
            Password changed successfully!
          </div>
        )}
        <button type="submit" style={styles.button} disabled={loading}>
          {loading ? 'Changing Password...' : 'Change Password'}
        </button>
      </form>
    </div>
  );
};

export default ChangePassword;
