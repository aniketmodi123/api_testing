import { useState } from 'react';
import { useAuth } from '../../../store/session.jsx';
import EnvironmentSwitcher from '../../EnvironmentSwitcher';
import ImportCurlModal from '../../ImportExport/ImportCurlModal';
import WorkspaceSelector from '../../WorkspaceSelector/WorkspaceSelector.jsx';
import Logo from './components/Logo.jsx';
import LogoutButton from './components/LogoutButton.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import UserProfile from './components/UserProfile.jsx';

export default function Header({ onCurlImport }) {
  const { user, logout } = useAuth();
  const [showCurlModal, setShowCurlModal] = useState(false);

  const styles = {
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '3px 16px',
      backgroundColor: 'var(--header-bg, transparent)',
      borderBottom: '1px solid var(--border-color, #eaeaea)',
    },
    leftSection: {
      display: 'flex',
      alignItems: 'center',
      gap: '20px',
    },
    actionsContainer: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
    },
    userContainer: {
      display: 'flex',
      alignItems: 'center',
    },
  };

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
    <header style={styles.header}>
      <div style={styles.leftSection}>
        <Logo />
        {user && (
          <>
            <WorkspaceSelector />
            <EnvironmentSwitcher />
          </>
        )}
      </div>
      <div style={styles.actionsContainer}>
        {user && (
          <button
            onClick={() => setShowCurlModal(true)}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              background: 'var(--p0-primary, var(--primary))',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
            title="Import cURL command"
          >
            Import cURL
          </button>
        )}
        <ThemeToggle />
        {user && (
          <div style={styles.userContainer}>
            <UserProfile username={user.email || user.username} />
            <LogoutButton onLogout={handleLogout} />
          </div>
        )}
      </div>
    </header>
    </>
  );
}
