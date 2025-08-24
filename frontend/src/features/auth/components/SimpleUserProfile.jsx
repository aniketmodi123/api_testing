import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../store/session.jsx';
import styles from './UserProfile.module.css';

function SimpleUserProfile() {
  const { user, getUserProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Using useCallback to prevent infinite loop with getUserProfile
  const fetchUserProfile = useCallback(async () => {
    // Only fetch if we're not already loading
    if (loading) {
      try {
        await getUserProfile();
        setError(null);
      } catch (err) {
        setError('Failed to load user profile data');
        console.error('Error fetching user profile:', err);
      } finally {
        setLoading(false);
      }
    }
  }, [getUserProfile, loading]);

  useEffect(() => {
    fetchUserProfile();
    // Empty dependency array so it only runs once on mount
  }, []);

  if (loading) {
    return (
      <div className={styles['user-profile']}>
        <h1>User Profile</h1>
        <div className={styles['profile-section']}>
          <p>Loading user data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles['user-profile']}>
        <h1>User Profile</h1>
        <div className={styles['profile-section']}>
          <p className={styles.error}>{error}</p>
          <button
            className={styles['action-button']}
            onClick={() => getUserProfile()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={styles['user-profile']}>
        <h1>User Profile</h1>
        <div className={styles['profile-section']}>
          <p>No user data available. Please log in again.</p>
        </div>
      </div>
    );
  }

  // Log the user object to help debug what fields are available
  console.log('User data in profile:', user);

  return (
    <div className={styles['user-profile']}>
      <h1>Your Profile</h1>

      <div className={styles['profile-section']}>
        <h2>Personal Information</h2>
        <div className={styles['profile-field']}>
          <div className={styles['field-label']}>Username</div>
          <div className={styles['field-value']}>
            {user.username || user.email}
          </div>
        </div>
        <div className={styles['profile-field']}>
          <div className={styles['field-label']}>Email</div>
          <div className={styles['field-value']}>{user.email}</div>
        </div>
        {user.name && (
          <div className={styles['profile-field']}>
            <div className={styles['field-label']}>Name</div>
            <div className={styles['field-value']}>{user.name}</div>
          </div>
        )}
        {user.id && (
          <div className={styles['profile-field']}>
            <div className={styles['field-label']}>User ID</div>
            <div className={styles['field-value']}>{user.id}</div>
          </div>
        )}
        {user.is_active !== undefined && (
          <div className={styles['profile-field']}>
            <div className={styles['field-label']}>Status</div>
            <div
              className={`${styles['field-value']} ${user.is_active ? styles.active : styles.inactive}`}
            >
              {user.is_active ? 'Active' : 'Inactive'}
            </div>
          </div>
        )}
      </div>

      {user.role && (
        <div className={styles['profile-section']}>
          <h2>Role & Permissions</h2>
          <div className={styles['profile-field']}>
            <div className={styles['field-label']}>Role</div>
            <div className={styles['field-value']}>{user.role}</div>
          </div>
          {user.permissions && user.permissions.length > 0 && (
            <div className={styles['profile-field']}>
              <div className={styles['field-label']}>Permissions</div>
              <div className={styles['field-value']}>
                <ul>
                  {user.permissions.map((permission, index) => (
                    <li key={index}>{permission}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {user.created_at && (
        <div className={styles['profile-section']}>
          <h2>Account Activity</h2>
          <div className={styles['profile-field']}>
            <div className={styles['field-label']}>Member Since</div>
            <div className={styles['field-value']}>
              {new Date(user.created_at).toLocaleDateString()}
            </div>
          </div>
          {user.last_login && (
            <div className={styles['profile-field']}>
              <div className={styles['field-label']}>Last Login</div>
              <div className={styles['field-value']}>
                {new Date(user.last_login).toLocaleString()}
              </div>
            </div>
          )}
        </div>
      )}

      <div className={styles['profile-actions']}>
        <button
          className={styles['action-button']}
          onClick={() => (window.location.href = '/update-profile')}
        >
          Update Profile
        </button>
      </div>
    </div>
  );
}

export default SimpleUserProfile;
