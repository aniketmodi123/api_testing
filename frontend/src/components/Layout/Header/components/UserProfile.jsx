import { useEffect, useRef, useState } from 'react';
import { FiKey, FiUser, FiUserX } from 'react-icons/fi';
import { Link } from 'react-router-dom';
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

  const closeDropdown = () => {
    setShowDropdown(false);
  };

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
          <div className={styles.divider}></div>
          <Link
            to="/profile"
            className={styles.dropdownItem}
            onClick={closeDropdown}
          >
            <FiUser className={styles.menuIcon} /> Profile
          </Link>
          <Link
            to="/change-password"
            className={styles.dropdownItem}
            onClick={closeDropdown}
          >
            <FiKey className={styles.menuIcon} /> Change Password
          </Link>
          <Link
            to="/delete-account"
            className={styles.dropdownItem}
            onClick={closeDropdown}
          >
            <FiUserX className={styles.menuIcon} /> Delete Account
          </Link>
        </div>
      )}
    </div>
  );
};

export default UserProfile;
