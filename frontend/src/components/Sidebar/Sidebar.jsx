import { useState } from 'react';
import styles from './Sidebar.module.css';

export default function Sidebar({ onTabChange }) {
  const [activeTab, setActiveTab] = useState('collections');

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
