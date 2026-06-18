import { FiLogOut } from 'react-icons/fi';
import styles from './HeaderComponents.module.css';

const LogoutButton = ({ onLogout }) => {
  return (
    <button className={styles.button} onClick={onLogout} title="Logout">
      <FiLogOut className={styles.icon} />
    </button>
  );
};

export default LogoutButton;
