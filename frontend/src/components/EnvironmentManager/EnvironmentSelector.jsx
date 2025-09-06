import { useState } from 'react';
import { formatDate } from '../../utils';
import styles from './EnvironmentSelector.module.css';

export default function EnvironmentSelector({
  environments,
  activeEnvironment,
  selectedEnvironment,
  onSelectEnvironment,
  onActivateEnvironment,
  onDeleteEnvironment,
  onEditEnvironment,
  isLoading,
}) {
  const [hoveredEnvironment, setHoveredEnvironment] = useState(null);

  const handleEnvironmentClick = environment => {
    onSelectEnvironment(environment);
  };

  const handleActivateClick = (e, environment) => {
    e.stopPropagation();
    onActivateEnvironment(environment.id);
  };

  const handleDeleteClick = (e, environment) => {
    e.stopPropagation();
    onDeleteEnvironment(environment);
  };

  return (
    <div className={styles.environmentSelector}>
      <div className={styles.environmentList}>
        {environments.map(environment => (
          <div
            key={environment.id}
            className={`${styles.environmentCard} ${
              selectedEnvironment?.id === environment.id ? styles.selected : ''
            } ${environment.is_active ? styles.active : ''}`}
            onClick={() => handleEnvironmentClick(environment)}
            onMouseEnter={() => setHoveredEnvironment(environment.id)}
            onMouseLeave={() => setHoveredEnvironment(null)}
          >
            <div className={styles.environmentInfo}>
              <div className={styles.environmentHeader}>
                <div className={styles.nameSection}>
                  <h4 className={styles.environmentName}>{environment.name}</h4>
                  {environment.is_active && (
                    <span className={styles.activeBadge}>
                      <span className={styles.activeDot}></span>
                      Active
                    </span>
                  )}
                </div>

                {(hoveredEnvironment === environment.id ||
                  selectedEnvironment?.id === environment.id) && (
                  <div className={styles.environmentActions}>
                    {!environment.is_active && (
                      <button
                        className={styles.actionButton}
                        onClick={e => handleActivateClick(e, environment)}
                        title="Activate environment"
                        disabled={isLoading}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M12 2L15.09 8.26L22 9L17 14L18.18 21L12 17.77L5.82 21L7 14L2 9L8.91 8.26L12 2Z"
                            fill="currentColor"
                          />
                        </svg>
                      </button>
                    )}

                    <button
                      className={`${styles.actionButton} ${styles.deleteButton}`}
                      onClick={e => handleDeleteClick(e, environment)}
                      title="Delete environment"
                      disabled={isLoading}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M19 7L18.1327 19.1425C18.0579 20.1891 17.187 21 16.1378 21H7.86224C6.81296 21 5.94208 20.1891 5.86732 19.1425L5 7M10 11V17M14 11V17M15 7V4C15 3.44772 14.5523 3 14 3H10C9.44772 3 9 3.44772 9 4V7M4 7H20"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {environment.description && (
                <p className={styles.environmentDescription}>
                  {environment.description}
                </p>
              )}

              <div className={styles.environmentMeta}>
                <div className={styles.variableCount}>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M7 7H17M7 12H17M7 17H17"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span>{environment.variable_count || 0} variables</span>
                </div>

                <div className={styles.createdDate}>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M8 2V5M16 2V5M3 10H21M5 4H19C20.1046 4 21 4.89543 21 6V20C21 21.1046 20.1046 22 19 22H5C3.89543 22 3 21.1046 3 20V6C3 4.89543 3.89543 4 5 4Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>{formatDate(environment.created_at)}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
