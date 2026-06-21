import { FiCheck } from 'react-icons/fi';
import styles from './Marketplace.module.css';

// Compact install-count formatter: 48200 -> "48.2k", 900 -> "900". Matches the mockup's
// "48.2k" style without pulling in a number-formatting dependency for one card field.
function formatInstalls(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default function ThemeCard({ theme, isInstalled, onInstall }) {
  return (
    <div className={styles.card}>
      {/* Data-driven preview swatches — same exception class as THEME_META previews:
          these hexes are the theme's own content, not component chrome. */}
      <div className={styles.pal}>
        {theme.palette.map((hex, i) => (
          <span key={`${theme.id}-${i}`} style={{ background: hex }} />
        ))}
      </div>
      <div className={styles.ft}>
        <div className={styles.ftTop}>
          <span className={styles.name}>{theme.name}</span>
          <span className={styles.tag}>{theme.tag}</span>
        </div>
        <div className={styles.meta}>
          by {theme.author} · {formatInstalls(theme.installs)} installs
        </div>
        <button
          type="button"
          className={`${styles.actionBtn} ${isInstalled ? styles.installed : styles.install}`}
          onClick={() => onInstall(theme)}
          disabled={isInstalled}
        >
          {isInstalled ? (
            <>
              <FiCheck className={styles.actionIcon} /> Installed
            </>
          ) : (
            'Install'
          )}
        </button>
      </div>
    </div>
  );
}
