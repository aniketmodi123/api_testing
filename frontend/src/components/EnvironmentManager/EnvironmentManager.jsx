import { useState } from 'react';
import { useEnvironment } from '../../store/environment';
import { Button } from '../common';
import styles from './EnvironmentManager.module.css';
import EnvironmentSelector from './EnvironmentSelector';

export default function EnvironmentManager({
  onEnvironmentSelect,
  onCreateEnvironment,
  onEditEnvironment,
}) {
  const {
    environments,
    activeEnvironment,
    selectedEnvironment,
    isLoading,
    error,
    selectEnvironment,
    activateEnvironment,
    deleteEnvironment,
  } = useEnvironment();

  // Modal states
  const [environmentToDelete, setEnvironmentToDelete] = useState(null);

  // Handle environment selection
  const handleSelectEnvironment = environment => {
    selectEnvironment(environment);

    // Notify parent component about environment selection
    if (onEnvironmentSelect) {
      onEnvironmentSelect(environment);
    }
  };

  // Handle environment activation
  const handleActivateEnvironment = async environmentId => {
    await activateEnvironment(environmentId);
  };

  // Handle environment deletion
  const handleDeleteEnvironment = async environment => {
    setEnvironmentToDelete(environment);
  };

  // Handle environment creation
  const handleCreateEnvironment = () => {
    if (onCreateEnvironment) {
      onCreateEnvironment();
    }
  };

  // Handle environment editing
  const handleEditEnvironment = environment => {
    if (onEditEnvironment) {
      onEditEnvironment(environment);
    }
  };

  const confirmDeleteEnvironment = async () => {
    if (environmentToDelete) {
      await deleteEnvironment(environmentToDelete.id);
      setEnvironmentToDelete(null);
    }
  };

  if (isLoading && environments.length === 0) {
    return (
      <div className={styles.environmentManager}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>Loading environments...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.environmentManager}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <h2>Environments</h2>
        </div>

        <div className={styles.actions}>
          <Button
            variant="primary"
            size="small"
            onClick={handleCreateEnvironment}
            disabled={isLoading}
          >
            +
          </Button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className={styles.error}>
          <span className={styles.errorIcon}>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Main Content */}
      <div className={styles.content}>
        {environments.length === 0 ? (
          /* Empty State */
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🌍</div>
            <h3>No environments created yet</h3>
            <p>
              Create your first environment to manage variables for different
              stages of your API testing workflow.
            </p>
          </div>
        ) : (
          /* Environment List Only */
          <div className={styles.environmentContent}>
            <EnvironmentSelector
              environments={environments}
              activeEnvironment={activeEnvironment}
              selectedEnvironment={selectedEnvironment}
              onSelectEnvironment={handleSelectEnvironment}
              onActivateEnvironment={handleActivateEnvironment}
              onDeleteEnvironment={handleDeleteEnvironment}
              onEditEnvironment={handleEditEnvironment}
              isLoading={isLoading}
            />
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      {environmentToDelete && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3>Delete Environment</h3>
            </div>
            <div className={styles.modalBody}>
              <p>
                Are you sure you want to delete the environment{' '}
                <strong>"{environmentToDelete.name}"</strong>?
              </p>
              <p className={styles.warning}>
                This action cannot be undone. All variables in this environment
                will be permanently deleted.
              </p>
            </div>
            <div className={styles.modalFooter}>
              <Button
                variant="secondary"
                onClick={() => setEnvironmentToDelete(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={confirmDeleteEnvironment}
                disabled={isLoading}
              >
                Delete Environment
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
