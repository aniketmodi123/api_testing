import { useEffect, useRef, useState } from 'react';
import { FiHome, FiKey, FiUser, FiUserX } from 'react-icons/fi';
import { Link, useLocation } from 'react-router-dom';
import styles from './HeaderComponents.module.css';

const UserProfile = ({ username }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const location = useLocation();

  // Check if we're on the home page
  const isHomePage = location.pathname === '/';

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
          {/* Dynamically show Home or Profile based on current page */}
          {isHomePage ? (
            <Link
              to="/profile"
              className={styles.dropdownItem}
              onClick={closeDropdown}
            >
              <FiUser className={styles.menuIcon} /> Profile
            </Link>
          ) : (
            <Link
              to="/"
              className={styles.dropdownItem}
              onClick={closeDropdown}
            >
              <FiHome className={styles.menuIcon} /> Home
            </Link>
          )}
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
