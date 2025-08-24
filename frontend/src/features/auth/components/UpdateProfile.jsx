import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../store/session.jsx';
import styles from './UserProfile.module.css';

const UpdateProfile = () => {
  const { user, updateUserProfile, getUserProfile } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
  });
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Load user data when component mounts
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        // Make sure we have the latest user data
        await getUserProfile();
        setLoading(false);
      } catch (err) {
        setError('Could not load user profile. Please try again later.');
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  // Update form data when user data is available
  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username || '',
        email: user.email || '',
      });
    }
  }, [user]);

  const handleChange = e => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Prepare update data (only send non-empty fields)
    const updateData = {};
    if (formData.username && formData.username !== user.username) {
      updateData.username = formData.username;
    }
    if (formData.email && formData.email !== user.email) {
      updateData.email = formData.email;
    }

    // Check if there are any changes
    if (Object.keys(updateData).length === 0) {
      setError('No changes to update');
      return;
    }

    try {
      setUpdating(true);
      await updateUserProfile(updateData);
      setSuccess('Profile updated successfully');
      setTimeout(() => {
        navigate('/profile');
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to update profile. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className={styles['user-profile']}>
        <h1>Update Profile</h1>
        <div className={styles['profile-section']}>
          <p>Loading profile data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles['user-profile']}>
      <h1>Update Profile</h1>

      {error && (
        <div className={`${styles['profile-section']} ${styles.error}`}>
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div className={`${styles['profile-section']} ${styles.success}`}>
          <p>{success}</p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className={styles['profile-section']}>
          <h2>Personal Information</h2>

          <div className={styles['form-group']}>
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              className={styles['form-control']}
            />
          </div>

          <div className={styles['form-group']}>
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className={styles['form-control']}
            />
          </div>
        </div>

        <div className={styles['profile-actions']}>
          <button
            type="submit"
            className={styles['action-button']}
            disabled={updating}
          >
            {updating ? 'Updating...' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className={styles['action-button-secondary']}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default UpdateProfile;
