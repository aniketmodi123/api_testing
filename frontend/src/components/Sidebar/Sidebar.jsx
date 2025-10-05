import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import styles from './Sidebar.module.css';

export default function Sidebar({ onTabChange }) {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('collections');

  // Sync with URL so refresh preserves selected tab highlight
  useEffect(() => {
    const path = location.pathname || '/';
    if (path === '/' || path.startsWith('/collections'))
      setActiveTab('collections');
    else if (path.startsWith('/environments')) setActiveTab('environments');
    else if (path.startsWith('/bulk-test')) setActiveTab('bulkTest');
  }, [location.pathname]);

  const handleTabChange = tab => {
    setActiveTab(tab);
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  return (
    <div className={styles.sidebar}>
      <div className={styles.tabs}>
        <div
          className={`${styles.tab} ${activeTab === 'collections' ? styles.active : ''}`}
          onClick={() => handleTabChange('collections')}
        >
          <span className={styles.tabIcon}>📚</span>
          <span className={styles.tabLabel}>Collections</span>
        </div>
        {/* Bulk Test tab inserted here */}
        <div
          className={`${styles.tab} ${activeTab === 'bulkTest' ? styles.active : ''}`}
          onClick={() => handleTabChange('bulkTest')}
        >
          <span className={styles.tabIcon}>🧪</span>
          <span className={styles.tabLabel}>Bulk Test</span>
        </div>
        <div
          className={`${styles.tab} ${activeTab === 'environments' ? styles.active : ''}`}
          onClick={() => handleTabChange('environments')}
        >
          <span className={styles.tabIcon}>🔧</span>
          <span className={styles.tabLabel}>Environments</span>
        </div>
      </div>
    </div>
  );
}
