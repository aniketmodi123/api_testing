import { useAuth } from '../../../store/session.jsx';
import EnvironmentSwitcher from '../../EnvironmentSwitcher';
import WorkspaceSelector from '../../WorkspaceSelector/WorkspaceSelector.jsx';
import styles from './components/HeaderComponents.module.css';
import Logo from './components/Logo.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import UserProfile from './components/UserProfile.jsx';

export default function Header() {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
  };

  return (
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
        <ThemeToggle />
        {user && (
          <UserProfile
            username={user.email || user.username}
            onLogout={handleLogout}
          />
        )}
      </div>
    </header>
  );
}
