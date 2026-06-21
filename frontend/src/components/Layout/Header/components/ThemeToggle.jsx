import { useState } from 'react';
import { FiMonitor, FiMoon, FiSun } from 'react-icons/fi';
import ThemePanel from '../../../ThemePanel/ThemePanel.jsx';
import { useTheme } from '../../../ThemeContext.jsx';
import styles from './HeaderComponents.module.css';

const THEME_ICONS = {
  light: FiSun,
  dark: FiMoon,
  'deep-dark': FiMonitor,
};

const ThemeToggle = () => {
  const { preferences } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const CurrentIcon = THEME_ICONS[preferences.theme] ?? FiMoon;

  return (
    <div className={styles.buttonContainer}>
      <button
        className={styles.button}
        onClick={() => setIsOpen((o) => !o)}
        title="Appearance"
      >
        <CurrentIcon className={styles.icon} />
      </button>

      {isOpen && <ThemePanel onClose={() => setIsOpen(false)} />}
    </div>
  );
};

export default ThemeToggle;
