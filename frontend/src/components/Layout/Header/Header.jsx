import { useAuth } from '../../../store/session.jsx';
import Logo from './components/Logo.jsx';
import LogoutButton from './components/LogoutButton.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import UserProfile from './components/UserProfile.jsx';

export default function Header() {
  const { user, logout } = useAuth();

  const styles = {
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      backgroundColor: 'var(--header-bg, transparent)',
      borderBottom: '1px solid var(--border-color, #eaeaea)',
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

  return (
    <header style={styles.header}>
      <Logo />
      <div style={styles.actionsContainer}>
        <ThemeToggle />
        {user && (
          <div style={styles.userContainer}>
            <UserProfile username={user.email || user.username} />
            <LogoutButton onLogout={handleLogout} />
          </div>
        )}
      </div>
    </header>
  );
}
