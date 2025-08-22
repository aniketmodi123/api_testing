import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../store/session.jsx';

const DeleteAccount = () => {
  const { deleteAccount, user } = useAuth();
  const navigate = useNavigate();
  const [confirmation, setConfirmation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleDeleteAccount = async e => {
    e.preventDefault();

    if (confirmation !== user?.email) {
      setError('Please enter your email address correctly to confirm deletion');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await deleteAccount();
      if (result.success) {
        navigate('/sign-in', { replace: true });
      } else {
        setError(
          result.message || 'Failed to delete account. Please try again.'
        );
      }
    } catch (error) {
      setError('An unexpected error occurred. Please try again.');
      console.error('Delete account error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const styles = {
    container: {
      maxWidth: '500px',
      margin: '0 auto',
      padding: '2rem',
    },
    title: {
      fontSize: '1.5rem',
      fontWeight: 'bold',
      marginBottom: '1rem',
      color: 'var(--text-color)',
    },
    warning: {
      color: '#e53e3e',
      fontWeight: 'bold',
      marginBottom: '1rem',
    },
    formSection: {
      backgroundColor: 'var(--card-bg)',
      borderRadius: '0.5rem',
      padding: '1.5rem',
      marginBottom: '1.5rem',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
      borderLeft: '4px solid #e53e3e',
    },
    paragraph: {
      marginBottom: '1rem',
      lineHeight: '1.6',
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
    deleteButton: {
      backgroundColor: '#e53e3e',
      color: '#fff',
      border: 'none',
      borderRadius: '0.25rem',
      padding: '0.75rem 1.5rem',
      cursor: 'pointer',
      fontWeight: '500',
      marginTop: '1rem',
    },
    cancelButton: {
      backgroundColor: 'transparent',
      color: 'var(--text-color)',
      border: '1px solid var(--border-color)',
      borderRadius: '0.25rem',
      padding: '0.75rem 1.5rem',
      cursor: 'pointer',
      marginTop: '1rem',
      marginRight: '1rem',
      fontWeight: '500',
    },
    buttonsContainer: {
      display: 'flex',
      justifyContent: 'flex-end',
      marginTop: '1rem',
    },
    errorMessage: {
      color: '#e53e3e',
      fontSize: '0.875rem',
      marginTop: '0.5rem',
    },
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Delete Account</h1>
      <div style={styles.formSection}>
        <p style={styles.warning}>⚠️ This action is irreversible</p>
        <p style={styles.paragraph}>
          Once you delete your account, all of your data, including your profile
          information and all saved API tests, will be permanently removed from
          our system.
        </p>
        <p style={styles.paragraph}>
          If you're sure you want to delete your account, please enter your
          email address below to confirm.
        </p>

        <form onSubmit={handleDeleteAccount}>
          <label style={styles.label}>
            Enter your email address ({user?.email}) to confirm
          </label>
          <input
            style={styles.input}
            type="email"
            value={confirmation}
            onChange={e => setConfirmation(e.target.value)}
            placeholder="Enter your email address"
            required
          />

          {error && <div style={styles.errorMessage}>{error}</div>}

          <div style={styles.buttonsContainer}>
            <button
              type="button"
              style={styles.cancelButton}
              onClick={() => navigate('/profile')}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={styles.deleteButton}
              disabled={isLoading || confirmation !== user?.email}
            >
              {isLoading ? 'Deleting...' : 'Delete Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DeleteAccount;
