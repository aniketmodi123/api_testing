import { useState } from 'react';
import { FiMonitor, FiMoon, FiSun } from 'react-icons/fi';
import ThemeBuilder from '../../../ThemeBuilder/ThemeBuilder.jsx';
import ThemePanel from '../../../ThemePanel/ThemePanel.jsx';
import Marketplace from '../../../Marketplace/Marketplace.jsx';
import { useTheme } from '../../../ThemeContext.jsx';
import styles from './HeaderComponents.module.css';

const THEME_ICONS = {
  light: FiSun,
  dark: FiMoon,
  'deep-dark': FiMonitor,
};

const ThemeToggle = () => {
  const { preferences, setPreference } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [isMarketplaceOpen, setIsMarketplaceOpen] = useState(false);

  const CurrentIcon = THEME_ICONS[preferences.theme] ?? FiMoon;

  // Theme builder and Marketplace are both full-screen overlays (Phase F / G) — opening
  // either closes the Appearance dropdown so none of the three ever stack.
  const openBuilder = () => {
    setIsOpen(false);
    setIsBuilderOpen(true);
  };

  const openMarketplace = () => {
    setIsOpen(false);
    setIsMarketplaceOpen(true);
  };

  return (
    <div className={styles.buttonContainer}>
      <button
        className={styles.button}
        onClick={() => setIsOpen((o) => !o)}
        title="Appearance"
      >
        <CurrentIcon className={styles.icon} />
      </button>

      {isOpen && (
        <ThemePanel
          onClose={() => setIsOpen(false)}
          onOpenBuilder={openBuilder}
          onOpenMarketplace={openMarketplace}
        />
      )}
      {isBuilderOpen && (
        <ThemeBuilder
          preferences={preferences}
          setPreference={setPreference}
          onClose={() => setIsBuilderOpen(false)}
        />
      )}
      {isMarketplaceOpen && (
        <Marketplace
          preferences={preferences}
          setPreference={setPreference}
          onClose={() => setIsMarketplaceOpen(false)}
        />
      )}
    </div>
  );
};

export default ThemeToggle;
