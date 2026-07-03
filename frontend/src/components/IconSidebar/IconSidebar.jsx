import { useEffect, useRef, useState } from 'react';
import {
  VscBeaker,
  VscFolder,
  VscHistory,
  VscServer,
} from 'react-icons/vsc';
import { useLocation } from 'react-router-dom';
import styles from './IconSidebar.module.css';

const NAV_ITEMS = [
  { id: 'collections', icon: VscFolder, label: 'Collections' },
  { id: 'environments', icon: VscServer, label: 'Environments' },
  { id: 'history', icon: VscHistory, label: 'History' },
  { id: 'bulkTest', icon: VscBeaker, label: 'Runner' },
];

function NavButton({ id, icon: Icon, label, isActive, onClick }) {
  const btnRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  const showTooltip = () => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setTooltip({ top: rect.bottom + 6, left: rect.left + rect.width / 2 });
  };

  const hideTooltip = () => setTooltip(null);

  return (
    <>
      <button
        ref={btnRef}
        className={`${styles.navBtn} ${isActive ? styles.active : ''}`}
        onClick={() => onClick(id)}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
      >
        <Icon className={styles.icon} />
      </button>
      {tooltip && (
        <div
          className={styles.tooltip}
          style={{ top: tooltip.top, left: tooltip.left }}
        >
          {label}
        </div>
      )}
    </>
  );
}

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
    <div className={styles.topBar}>
      <nav className={styles.navItems}>
        {NAV_ITEMS.map(({ id, icon, label }) => (
          <NavButton
            key={id}
            id={id}
            icon={icon}
            label={label}
            isActive={activeTab === id}
            onClick={handleClick}
          />
        ))}
      </nav>
    </div>
  );
}
