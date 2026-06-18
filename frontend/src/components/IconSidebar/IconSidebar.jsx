import { useEffect, useState } from 'react';
import {
  VscBeaker,
  VscFolder,
  VscHistory,
  VscSettingsGear,
} from 'react-icons/vsc';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../store/session';
import { useWorkspace } from '../../store/workspace';
import styles from './IconSidebar.module.css';

const NAV_ITEMS = [
  { id: 'collections', icon: VscFolder, label: 'Collections' },
  { id: 'history', icon: VscHistory, label: 'History' },
  { id: 'bulkTest', icon: VscBeaker, label: 'Runner' },
];

export default function IconSidebar({ onTabChange }) {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('collections');
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();

  useEffect(() => {
    const path = location.pathname || '/';
    if (path === '/' || path.startsWith('/collections'))
      setActiveTab('collections');
    else if (path.startsWith('/bulk-test')) setActiveTab('bulkTest');
    else if (path.startsWith('/history')) setActiveTab('history');
  }, [location.pathname]);

  const handleClick = id => {
    setActiveTab(id);
    if (onTabChange) onTabChange(id);
  };

  // Derive user initial for avatar
  const userInitial = (user?.email || user?.username || 'U')[0].toUpperCase();
  // Derive workspace display name
  const workspaceName = activeWorkspace?.name || 'My Workspace';

  return (
    <div className={styles.sidebar}>
      {/* Nav items */}
      <nav className={styles.navItems}>
        {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            className={`${styles.navBtn} ${activeTab === id ? styles.active : ''}`}
            onClick={() => handleClick(id)}
          >
            <Icon className={styles.icon} />
            <span className={styles.label}>{label}</span>
          </button>
        ))}
      </nav>

      {/* Bottom strip */}
      <div className={styles.bottom}>
        <button
          className={styles.navBtn}
          onClick={() => handleClick('settings')}
        >
          <VscSettingsGear className={styles.icon} />
          <span className={styles.label}>Settings</span>
        </button>

        <div className={styles.workspaceStrip}>
          <div className={styles.userAvatar}>{userInitial}</div>
          <div className={styles.workspaceInfo}>
            <span className={styles.workspaceName}>{workspaceName}</span>
            <span className={styles.userEmail}>
              {user?.email || user?.username || ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
