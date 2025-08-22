import { useEffect, useRef, useState } from 'react';
import { FiUser } from 'react-icons/fi';
import styles from './HeaderComponents.module.css';

const UserProfile = ({ username }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div
      className={styles.buttonContainer}
      ref={dropdownRef}
      style={{ marginLeft: '1rem' }}
    >
      <button
        className={styles.button}
        onClick={() => setShowDropdown(!showDropdown)}
        title="User profile"
      >
        <FiUser className={styles.icon} />
      </button>

      {showDropdown && (
        <div className={styles.dropdown}>
          <p className={styles.email}>{username}</p>
        </div>
      )}
    </div>
  );
};

export default UserProfile;
