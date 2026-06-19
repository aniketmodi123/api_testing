import { useState } from 'react';
import { useEnvironment } from '../../store/environment';
import ConfirmModal from '../ConfirmModal/ConfirmModal';
import styles from './EnvironmentManager.module.css';
import EnvironmentSelector from './EnvironmentSelector';

export default function EnvironmentManager({
  onEnvironmentSelect,
  onCreateEnvironment,
  onGlobalSelect,
  selectedGlobal,
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
    duplicateEnvironment,
    updateEnvironment,
  } = useEnvironment();

  const [environmentToDelete, setEnvironmentToDelete] = useState(null);

  const handleSelectEnvironment = environment => {
    selectEnvironment(environment);
    if (onEnvironmentSelect) onEnvironmentSelect(environment);
  };

  const handleRenameEnvironment = async (environmentId, newName) => {
    await updateEnvironment(environmentId, { name: newName });
  };

  const handleDuplicateEnvironment = async env => {
    const newEnv = await duplicateEnvironment(env);
    if (newEnv) {
      selectEnvironment(newEnv);
      if (onEnvironmentSelect) onEnvironmentSelect(newEnv);
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
          <div className={styles.spinner} />
          <p>Loading environments…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.environmentManager}>
      {error && (
        <div className={styles.error}>
          <span>⚠ </span>
          <span>{typeof error === 'object' ? JSON.stringify(error) : error}</span>
        </div>
      )}

      {/* Global Variables — clickable row, opens in right panel */}
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>Global Variables</span>
      </div>
      <button
        className={`${styles.globalRow} ${selectedGlobal ? styles.globalRowActive : ''}`}
        onClick={onGlobalSelect}
        type="button"
      >
        <span className={styles.globalIcon}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="currentColor" strokeWidth="1.8"/>
          </svg>
        </span>
        <span className={styles.globalLabel}>Global Variables</span>
        <span className={styles.globalChevron}>›</span>
      </button>

      <div className={styles.divider} />

      {/* Environments header */}
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>Environments</span>
        <button
          className={styles.addEnvBtn}
          onClick={onCreateEnvironment}
          disabled={isLoading}
          title="New environment"
          type="button"
        >
          <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Environment list */}
      <div className={styles.content}>
        {environments.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🌍</div>
            <p>No environments yet</p>
            <button className={styles.createBtn} onClick={onCreateEnvironment} type="button">
              Create Environment
            </button>
          </div>
        ) : (
          <EnvironmentSelector
            environments={environments}
            activeEnvironment={activeEnvironment}
            selectedEnvironment={selectedEnvironment}
            onSelectEnvironment={handleSelectEnvironment}
            onActivateEnvironment={id => activateEnvironment(id)}
            onDeleteEnvironment={env => setEnvironmentToDelete(env)}
            onDuplicateEnvironment={handleDuplicateEnvironment}
            onRenameEnvironment={handleRenameEnvironment}
            isLoading={isLoading}
          />
        )}
      </div>

      <ConfirmModal
        isOpen={!!environmentToDelete}
        title="Delete Environment"
        message={<>Delete <strong>"{environmentToDelete?.name}"</strong>?</>}
        warn_message={<><strong>⚠ Warning:</strong> All variables in this environment will be permanently deleted.</>}
        confirmText="Delete Environment"
        cancelText="Cancel"
        type="delete"
        loading={isLoading}
        onConfirm={confirmDeleteEnvironment}
        onCancel={() => setEnvironmentToDelete(null)}
      />
    </div>
  );
}
