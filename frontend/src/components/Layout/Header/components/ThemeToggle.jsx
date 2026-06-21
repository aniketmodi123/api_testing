import { useState } from 'react';
import { FiMoon, FiSun } from 'react-icons/fi';
import ThemePanel from '../../../ThemePanel/ThemePanel.jsx';
import { useTheme } from '../../../ThemeContext.jsx';
import { LIGHT_THEME_IDS } from '../../../../themes/index.js';
import styles from './HeaderComponents.module.css';

const ThemeToggle = () => {
  const { preferences } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const CurrentIcon = LIGHT_THEME_IDS.includes(preferences.theme) ? FiSun : FiMoon;

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
