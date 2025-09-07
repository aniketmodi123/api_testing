import { useEffect, useState } from 'react';
import { useEnvironment } from '../../store/environment';
import { formatDateTime } from '../../utils';
import { Button } from '../common';
import styles from './EnvironmentDetail.module.css';
import VariableResolutionPanel from './VariableResolutionPanel';

export default function EnvironmentDetail({
  environment,
  variables,
  isActive,
  onCreateVariable,
  onEditVariable,
  onEditEnvironment,
}) {
  const {
    updateEnvironment,
    activateEnvironment,
    createVariable,
    updateVariable,
    deleteVariable,
    saveVariables,
    isLoading,
  } = useEnvironment();

  // Local state
  const [activeTab, setActiveTab] = useState('variables'); // 'variables' or 'preview'
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: environment.name,
    description: environment.description || '',
  });

  // Variables editing state
  const [variablesData, setVariablesData] = useState(
    variables.map(v => ({ ...v })) || []
  );
  const [newVariable, setNewVariable] = useState({ key: '', value: '' });
  const [hasVariableChanges, setHasVariableChanges] = useState(false);

  // Update variables data when environment or variables change
  useEffect(() => {
    setVariablesData(variables.map(v => ({ ...v })) || []);
    setNewVariable({ key: '', value: '' });
    setHasVariableChanges(false);
  }, [environment.id, variables]);

  // Update edit form when environment changes
  useEffect(() => {
    console.log('🔄 Environment prop changed:', {
      id: environment.id,
      name: environment.name,
      description: environment.description,
      updated_at: environment.updated_at,
    });
    console.log('🎯 Full environment object:', environment);
    setEditForm({
      name: environment.name,
      description: environment.description || '',
    });
  }, [environment]); // Changed to depend on the entire environment object

  // Handle inline editing
  const handleEditToggle = () => {
    if (isEditing) {
      // Reset form when canceling
      setEditForm({
        name: environment.name,
        description: environment.description || '',
      });
    }
    setIsEditing(!isEditing);
  };

  const handleSaveEnvironment = async () => {
    const success = await updateEnvironment(environment.id, {
      name: editForm.name.trim(),
      description: editForm.description.trim() || null,
    });

    if (success) {
      setIsEditing(false);
    }
  };

  // Variable management handlers
  const handleVariableChange = (index, field, value) => {
    const updatedVariables = [...variablesData];
    updatedVariables[index][field] = value;
    setVariablesData(updatedVariables);
    setHasVariableChanges(true);
  };

  const handleRemoveVariable = index => {
    const updatedVariables = variablesData.filter((_, i) => i !== index);
    setVariablesData(updatedVariables);
    setHasVariableChanges(true);
  };

  const handleAddVariable = () => {
    if (newVariable.key.trim() && newVariable.value.trim()) {
      setVariablesData([
        ...variablesData,
        {
          key: newVariable.key.trim(),
          value: newVariable.value.trim(),
          id: Date.now(), // Temporary ID for new variables
        },
      ]);
      setNewVariable({ key: '', value: '' });
      setHasVariableChanges(true);
    }
  };

  const handleSaveVariables = async () => {
    try {
      // Prepare variables data for API (convert to proper format)
      const variablesToSave = variablesData.map(variable => ({
        key: variable.key,
        value: variable.value,
        description: variable.description || '',
        is_enabled: variable.is_enabled !== false,
      }));

      // Use unified save endpoint (handles both create and update)
      const success = await saveVariables(environment.id, variablesToSave);

      if (success) {
        setHasVariableChanges(false);
      }
    } catch (error) {
      console.error('Error saving variables:', error);
    }
  };

  const handleCancelVariableChanges = () => {
    setVariablesData(variables.map(v => ({ ...v })) || []);
    setNewVariable({ key: '', value: '' });
    setHasVariableChanges(false);
  };

  const handleActivate = async () => {
    await activateEnvironment(environment.id);
  };

  return (
    <div className={styles.environmentDetail}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.environmentInfo}>
          {isEditing ? (
            <div className={styles.editForm}>
              <input
                type="text"
                value={editForm.name}
                onChange={e =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
                className={styles.nameInput}
                placeholder="Environment name"
                maxLength={100}
              />
              <textarea
                value={editForm.description}
                onChange={e =>
                  setEditForm({ ...editForm, description: e.target.value })
                }
                className={styles.descriptionInput}
                placeholder="Environment description (optional)"
                rows={2}
                maxLength={500}
              />
            </div>
          ) : (
            <div className={styles.viewInfo}>
              <div className={styles.titleRow}>
                <h2 className={styles.environmentName}>{environment.name}</h2>
                {isActive && (
                  <span className={styles.activeBadge}>
                    <span className={styles.activeDot}></span>
                    Active
                  </span>
                )}
              </div>

              {environment.description && (
                <p className={styles.environmentDescription}>
                  {environment.description}
                </p>
              )}

              <div className={styles.metaInfo}>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Created:</span>
                  <span className={styles.metaValue}>
                    {formatDateTime(environment.created_at)}
                  </span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Variables:</span>
                  <span className={styles.metaValue}>
                    {variables.length} variable
                    {variables.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={styles.headerActions}>
          {isEditing ? (
            <>
              <Button
                variant="secondary"
                size="small"
                onClick={handleEditToggle}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="small"
                onClick={handleSaveEnvironment}
                disabled={isLoading || !editForm.name.trim()}
              >
                Save
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                size="small"
                onClick={handleEditToggle}
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
                    d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13M18.5 2.5C18.8978 2.10217 19.4374 1.87868 20 1.87868C20.5626 1.87868 21.1022 2.10217 21.5 2.5C21.8978 2.89783 22.1213 3.43739 22.1213 4C22.1213 4.56261 21.8978 5.10217 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Edit
              </Button>

              {!isActive && (
                <Button
                  variant="primary"
                  size="small"
                  onClick={handleActivate}
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
                  Activate
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'variables' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('variables')}
        >
          <svg
            width="16"
            height="16"
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
          Variables ({variables.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'preview' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('preview')}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx="12"
              cy="12"
              r="3"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
          Preview
        </button>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {activeTab === 'variables' ? (
          <div className={styles.variablesTab}>
            <div className={styles.variablesHeader}>
              <h3>Environment Variables</h3>
              {hasVariableChanges && (
                <div className={styles.buttonGroup}>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={handleCancelVariableChanges}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="small"
                    onClick={handleSaveVariables}
                  >
                    Save Changes
                  </Button>
                </div>
              )}
            </div>

            {/* Variables Table */}
            <div className={styles.variablesTable}>
              {variablesData.length > 0 && (
                <div className={styles.tableHeader}>
                  <div className={styles.tableCell}>Key</div>
                  <div className={styles.tableCell}>Value</div>
                  <div className={styles.tableActions}>Actions</div>
                </div>
              )}

              {variablesData.map((variable, index) => (
                <div key={variable.id || index} className={styles.tableRow}>
                  <div className={styles.tableCell}>
                    <input
                      type="text"
                      value={variable.key}
                      onChange={e =>
                        handleVariableChange(index, 'key', e.target.value)
                      }
                      className={styles.tableInput}
                      placeholder="Variable key"
                    />
                  </div>
                  <div className={styles.tableCell}>
                    <input
                      type="text"
                      value={variable.value}
                      onChange={e =>
                        handleVariableChange(index, 'value', e.target.value)
                      }
                      className={styles.tableInput}
                      placeholder="Variable value"
                    />
                  </div>
                  <div className={styles.tableActions}>
                    <button
                      onClick={() => handleRemoveVariable(index)}
                      className={styles.removeButton}
                      title="Remove variable"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}

              {/* Add new variable row */}
              <div className={styles.tableRow}>
                <div className={styles.tableCell}>
                  <input
                    type="text"
                    value={newVariable.key}
                    onChange={e =>
                      setNewVariable({ ...newVariable, key: e.target.value })
                    }
                    className={styles.tableInput}
                    placeholder="New variable key"
                  />
                </div>
                <div className={styles.tableCell}>
                  <input
                    type="text"
                    value={newVariable.value}
                    onChange={e =>
                      setNewVariable({ ...newVariable, value: e.target.value })
                    }
                    className={styles.tableInput}
                    placeholder="New variable value"
                  />
                </div>
                <div className={styles.tableActions}>
                  <button
                    onClick={handleAddVariable}
                    className={styles.addButton}
                    disabled={
                      !newVariable.key.trim() || !newVariable.value.trim()
                    }
                    title="Add variable"
                  >
                    +
                  </button>
                </div>
              </div>

              {variablesData.length === 0 && (
                <div className={styles.emptyState}>
                  No variables configured. Add one using the form above.
                </div>
              )}
            </div>
          </div>
        ) : (
          <VariableResolutionPanel
            environment={environment}
            variables={variables}
          />
        )}
      </div>
    </div>
  );
}
