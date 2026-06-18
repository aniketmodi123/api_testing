import { useState } from 'react';
import { useAuth } from '../../../store/session.jsx';
import EnvironmentSwitcher from '../../EnvironmentSwitcher';
import ImportCurlModal from '../../ImportExport/ImportCurlModal';
import WorkspaceSelector from '../../WorkspaceSelector/WorkspaceSelector.jsx';
import styles from './components/HeaderComponents.module.css';
import Logo from './components/Logo.jsx';
import LogoutButton from './components/LogoutButton.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import UserProfile from './components/UserProfile.jsx';

export default function Header({ onCurlImport }) {
  const { user, logout } = useAuth();
  const [showCurlModal, setShowCurlModal] = useState(false);

  const handleLogout = () => {
    logout();
    // AuthGuard will handle navigation after logout
  };

  const handleCurlImport = parsed => {
    if (onCurlImport) onCurlImport(parsed);
  };

  return (
    <>
      {showCurlModal && (
        <ImportCurlModal
          onClose={() => setShowCurlModal(false)}
          onImport={handleCurlImport}
        />
      )}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Logo />
        </div>
        <div className={styles.headerCenter}>
          {user && (
            <>
              <WorkspaceSelector />
              <EnvironmentSwitcher />
            </>
          )}
        </div>
        <div className={styles.headerRight}>
          {user && (
            <button
              onClick={() => setShowCurlModal(true)}
              className={styles.importBtn}
              title="Import cURL command"
            >
              Import cURL
            </button>
          )}
          <ThemeToggle />
          {user && (
            <>
              <UserProfile username={user.email || user.username} />
              <LogoutButton onLogout={handleLogout} />
            </>
          )}
        </div>
      </header>
    </>
  );
}
