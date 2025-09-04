import { useEffect, useRef, useState } from 'react';
import { useEnvironment } from '../../store/environment';
import styles from './EnvironmentSwitcher.module.css';

export default function EnvironmentSwitcher() {
  const { environments, activeEnvironment, activateEnvironment, isLoading } =
    useEnvironment();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = event => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleEnvironmentSelect = async environmentId => {
    setIsOpen(false);
    if (environmentId !== activeEnvironment?.id) {
      await activateEnvironment(environmentId);
    }
  };

  if (environments.length === 0) {
    return (
      <div className={styles.switcher}>
        <div className={styles.noEnvironments}>
          <span className={styles.label}>No environments</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.switcher} ref={dropdownRef}>
      <button
        className={`${styles.trigger} ${isOpen ? styles.open : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        title="Switch environment"
      >
        <div className={styles.activeEnvironment}>
          {activeEnvironment ? (
            <>
              <span className={styles.activeDot}></span>
              <span className={styles.environmentName}>
                {activeEnvironment.name}
              </span>
            </>
          ) : (
            <span className={styles.noActive}>No active environment</span>
          )}
        </div>

        <svg
          className={`${styles.chevron} ${isOpen ? styles.rotated : ''}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M6 9L12 15L18 9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <span className={styles.dropdownTitle}>Switch Environment</span>
          </div>

          <div className={styles.environmentList}>
            {environments.map(environment => (
              <button
                key={environment.id}
                className={`${styles.environmentOption} ${
                  environment.id === activeEnvironment?.id ? styles.active : ''
                }`}
                onClick={() => handleEnvironmentSelect(environment.id)}
                disabled={isLoading}
              >
                <div className={styles.environmentInfo}>
                  <div className={styles.environmentHeader}>
                    <span className={styles.optionName}>
                      {environment.name}
                    </span>
                    {environment.id === activeEnvironment?.id && (
                      <span className={styles.activeIndicator}>
                        <span className={styles.activeText}>Active</span>
                      </span>
                    )}
                  </div>

                  {environment.description && (
                    <span className={styles.optionDescription}>
                      {environment.description}
                    </span>
                  )}

                  <div className={styles.environmentMeta}>
                    <span className={styles.variableCount}>
                      {environment.variables?.length || 0} variable
                      {(environment.variables?.length || 0) !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {environments.some(env => !env.is_active) && (
            <div className={styles.dropdownFooter}>
              <div className={styles.footerText}>
                Click to activate a different environment
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
