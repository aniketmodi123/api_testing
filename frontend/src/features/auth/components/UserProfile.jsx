import { useEffect, useState } from 'react';
import { useAuth } from '../../../store/session.jsx';

const UserProfile = () => {
  const {
    user,
    loading: profileLoading,
    error: profileError,
    getUserProfile,
    updateUserProfile,
  } = useAuth();
  const [updateUserLoading, setUpdateUserLoading] = useState(false);
  const [updateUserError, setUpdateUserError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
  });
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    // Only fetch profile once when component mounts
    if (!hasLoaded) {
      getUserProfile();
      setHasLoaded(true);
    }
  }, [getUserProfile, hasLoaded]);

  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username || '',
        email: user.email || '',
      });
    }
  }, [user]);

  const handleInputChange = e => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setUpdateUserLoading(true);
    setUpdateUserError(null);

    try {
      const result = await updateUserProfile(formData);
      if (result.success) {
        setIsEditing(false);
      } else {
        setUpdateUserError(result.message);
      }
    } catch (error) {
      setUpdateUserError('Failed to update profile');
      console.error('Failed to update profile:', error);
    } finally {
      setUpdateUserLoading(false);
    }
  };

  const styles = {
    container: {
      maxWidth: '600px',
      margin: '0 auto',
      padding: '2rem',
    },
    title: {
      fontSize: '1.5rem',
      fontWeight: 'bold',
      marginBottom: '1.5rem',
      color: 'var(--text-color)',
    },
    profileSection: {
      backgroundColor: 'var(--card-bg)',
      borderRadius: '0.5rem',
      padding: '1.5rem',
      marginBottom: '1.5rem',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    },
    detailRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0.75rem 0',
      borderBottom: '1px solid var(--border-color)',
    },
    label: {
      fontWeight: '500',
      color: 'var(--muted)',
      flex: '1',
    },
    value: {
      color: 'var(--text-color)',
      flex: '2',
    },
    button: {
      backgroundColor: 'var(--primary)',
      color: '#fff',
      border: 'none',
      borderRadius: '0.25rem',
      padding: '0.5rem 1rem',
      cursor: 'pointer',
      marginTop: '1rem',
      fontWeight: '500',
    },
    cancelButton: {
      backgroundColor: 'transparent',
      color: 'var(--text-color)',
      border: '1px solid var(--border-color)',
      borderRadius: '0.25rem',
      padding: '0.5rem 1rem',
      cursor: 'pointer',
      marginTop: '1rem',
      marginRight: '0.5rem',
      fontWeight: '500',
    },
    input: {
      width: '100%',
      padding: '0.5rem',
      border: '1px solid var(--border-color)',
      borderRadius: '0.25rem',
      backgroundColor: 'var(--input)',
      color: 'var(--text-color)',
      marginTop: '0.25rem',
    },
    formGroup: {
      marginBottom: '1rem',
    },
    buttonsContainer: {
      display: 'flex',
      justifyContent: 'flex-end',
    },
    errorMessage: {
      color: '#e53e3e',
      fontSize: '0.875rem',
      marginTop: '0.5rem',
    },
    loading: {
      color: 'var(--muted)',
      textAlign: 'center',
      padding: '1rem 0',
    },
  };

  if (profileLoading) {
    return <div style={styles.loading}>Loading profile...</div>;
  }

  if (profileError) {
    return (
      <div style={styles.errorMessage}>
        Error loading profile: {profileError}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>User Profile</h1>

      <div style={styles.profileSection}>
        {!isEditing ? (
          <>
            <div style={styles.detailRow}>
              <span style={styles.label}>Username</span>
              <span style={styles.value}>{user?.username || 'Not set'}</span>
            </div>
            <div style={styles.detailRow}>
              <span style={styles.label}>Email</span>
              <span style={styles.value}>{user?.email || 'Not set'}</span>
            </div>
            {user?.created_at && (
              <div style={styles.detailRow}>
                <span style={styles.label}>Member Since</span>
                <span style={styles.value}>
                  {new Date(user.created_at).toLocaleDateString()}
                </span>
              </div>
            )}
            <div style={styles.buttonsContainer}>
              <button style={styles.button} onClick={() => setIsEditing(true)}>
                Edit Profile
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Username</label>
              <input
                style={styles.input}
                type="text"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Email</label>
              <input
                style={styles.input}
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
              />
            </div>
            {updateUserError && (
              <div style={styles.errorMessage}>{updateUserError}</div>
            )}
            <div style={styles.buttonsContainer}>
              <button
                type="button"
                style={styles.cancelButton}
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={styles.button}
                disabled={updateUserLoading}
              >
                {updateUserLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default UserProfile;
