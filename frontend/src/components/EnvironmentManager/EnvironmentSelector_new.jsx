import { useState } from 'react';
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

  const formatDate = dateString => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

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

  const handleEditClick = (e, environment) => {
    e.stopPropagation();
    onEditEnvironment(environment);
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
                      className={`${styles.actionButton} ${styles.editButton}`}
                      onClick={e => handleEditClick(e, environment)}
                      title="Edit environment"
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
                          d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M18.5 2.49998C18.8978 2.10216 19.4374 1.87866 20 1.87866C20.5626 1.87866 21.1022 2.10216 21.5 2.49998C21.8978 2.89781 22.1213 3.43737 22.1213 3.99998C22.1213 4.56259 21.8978 5.10216 21.5 5.49998L12 15L8 16L9 12L18.5 2.49998Z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>

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
