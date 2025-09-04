import { useState } from 'react';
import { useEnvironment } from '../../store/environment';
import { Button } from '../common';
import CreateEnvironmentModal from './CreateEnvironmentModal';
import EnvironmentDetail from './EnvironmentDetail';
import styles from './EnvironmentManager.module.css';
import EnvironmentSelector from './EnvironmentSelector';

export default function EnvironmentManager() {
  const {
    environments,
    activeEnvironment,
    selectedEnvironment,
    variables,
    isLoading,
    error,
    selectEnvironment,
    activateEnvironment,
    deleteEnvironment,
    createEnvironment,
    createEnvironmentFromTemplate,
    updateEnvironment,
  } = useEnvironment();

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [environmentToDelete, setEnvironmentToDelete] = useState(null);
  const [environmentToEdit, setEnvironmentToEdit] = useState(null);

  // Handle environment selection
  const handleSelectEnvironment = environment => {
    selectEnvironment(environment);
  };

  // Handle environment activation
  const handleActivateEnvironment = async environmentId => {
    await activateEnvironment(environmentId);
  };

  // Handle environment deletion
  const handleDeleteEnvironment = async environment => {
    setEnvironmentToDelete(environment);
  };

  // Handle environment editing
  const handleEditEnvironment = environment => {
    setEnvironmentToEdit(environment);
  };

  // Handle update environment
  const handleUpdateEnvironment = async environmentData => {
    try {
      const success = await updateEnvironment(
        environmentToEdit.id,
        environmentData
      );
      if (success) {
        setEnvironmentToEdit(null);
      }
    } catch (error) {
      console.error('Error updating environment:', error);
      // Keep modal open if there's an error
    }
  };

  const confirmDeleteEnvironment = async () => {
    if (environmentToDelete) {
      await deleteEnvironment(environmentToDelete.id);
      setEnvironmentToDelete(null);
    }
  };

  // Handle create custom environment
  const handleCreateEnvironment = async environmentData => {
    try {
      // Extract default variables and format for backend
      const { defaultVariables, ...envData } = environmentData;

      // Format the environment data for the backend API
      const backendEnvData = {
        ...envData,
        variables: defaultVariables || [], // Include variables in the format backend expects
      };

      const newEnvironment = await createEnvironment(backendEnvData);

      if (newEnvironment) {
        setShowCreateModal(false);
      }
    } catch (error) {
      console.error('Error creating environment:', error);
      // Keep modal open if there's an error
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
            onClick={() => setShowCreateModal(true)}
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
            <div className={styles.emptyActions}>
              <Button
                variant="primary"
                onClick={() => setShowCreateModal(true)}
                disabled={isLoading}
              >
                Create Environment
              </Button>
            </div>
          </div>
        ) : (
          /* Environment List and Details */
          <div className={styles.environmentContent}>
            <div className={styles.leftPanel}>
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

            <div className={styles.rightPanel}>
              {selectedEnvironment ? (
                <EnvironmentDetail
                  environment={selectedEnvironment}
                  variables={variables}
                  isActive={activeEnvironment?.id === selectedEnvironment.id}
                />
              ) : (
                <div className={styles.noSelection}>
                  <div className={styles.noSelectionIcon}>📝</div>
                  <h3>Select an environment</h3>
                  <p>
                    Choose an environment from the list to view and manage its
                    variables.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateEnvironmentModal
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreateEnvironment}
        />
      )}

      {/* Edit Environment Modal */}
      {environmentToEdit && (
        <CreateEnvironmentModal
          onClose={() => setEnvironmentToEdit(null)}
          onSave={handleUpdateEnvironment}
          initialData={environmentToEdit}
          isEdit={true}
        />
      )}

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
