import { FiMoon, FiSun } from 'react-icons/fi';
import { useTheme } from '../../../ThemeProvider.jsx';
import styles from './HeaderComponents.module.css';

const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <button
      className={styles.button}
      onClick={toggleTheme}
      title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
    >
      {theme === 'light' ? (
        <FiMoon className={styles.icon} />
      ) : (
        <FiSun className={styles.icon} />
      )}
    </button>
  );
};

export default ThemeToggle;
