import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  VscFolder,
  VscGlobe,
  VscHistory,
  VscBeaker,
  VscSettingsGear,
} from 'react-icons/vsc';
import styles from './IconSidebar.module.css';

const NAV_ITEMS = [
  { id: 'collections', icon: VscFolder,    label: 'Collections' },
  { id: 'environments', icon: VscGlobe,    label: 'Environments' },
  { id: 'history',     icon: VscHistory,   label: 'History' },
  { id: 'bulkTest',    icon: VscBeaker,    label: 'Bulk Test' },
];

export default function IconSidebar({ onTabChange }) {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('collections');

  useEffect(() => {
    const path = location.pathname || '/';
    if (path === '/' || path.startsWith('/collections')) setActiveTab('collections');
    else if (path.startsWith('/environments')) setActiveTab('environments');
    else if (path.startsWith('/bulk-test')) setActiveTab('bulkTest');
    else if (path.startsWith('/history')) setActiveTab('history');
  }, [location.pathname]);

  const handleClick = id => {
    setActiveTab(id);
    if (onTabChange) onTabChange(id);
  };

  return (
    <div className={styles.sidebar}>
      <div className={styles.navItems}>
        {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            className={`${styles.navBtn} ${activeTab === id ? styles.active : ''}`}
            onClick={() => handleClick(id)}
            title={label}
          >
            <Icon className={styles.icon} />
            <span className={styles.label}>{label}</span>
          </button>
        ))}
      </div>
      <div className={styles.bottom}>
        <button className={styles.navBtn} title="Settings">
          <VscSettingsGear className={styles.icon} />
          <span className={styles.label}>Settings</span>
        </button>
      </div>
    </div>
  );
}
