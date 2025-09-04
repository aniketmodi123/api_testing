import { useState } from 'react';
import { useEnvironment } from '../../store/environment';
import styles from './VariableList.module.css';

export default function VariableList({ variables, environmentId }) {
  const { updateVariable, deleteVariable, validateVariableKey, isLoading } =
    useEnvironment();

  // State for inline editing
  const [editingVariable, setEditingVariable] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [variableToDelete, setVariableToDelete] = useState(null);

  // Handle inline editing
  const startEditing = variable => {
    setEditingVariable(variable.id);
    setEditForm({
      key: variable.key,
      value: variable.value || '',
      description: variable.description || '',
      is_enabled: variable.is_enabled,
      is_secret: variable.is_secret,
    });
  };

  const cancelEditing = () => {
    setEditingVariable(null);
    setEditForm({});
  };

  const saveVariable = async variableId => {
    // Validate key
    if (!validateVariableKey(editForm.key)) {
      alert(
        'Invalid variable key. Keys must start with a letter or underscore and contain only letters, numbers, underscores, and hyphens.'
      );
      return;
    }

    // Check for duplicate keys
    const existingVariable = safeVariables.find(
      v => v.id !== variableId && v.key === editForm.key
    );
    if (existingVariable) {
      alert('A variable with this key already exists in this environment.');
      return;
    }

    const success = await updateVariable(variableId, {
      key: editForm.key.trim(),
      value: editForm.value,
      description: editForm.description.trim() || null,
      is_enabled: editForm.is_enabled,
      is_secret: editForm.is_secret,
    });

    if (success) {
      setEditingVariable(null);
      setEditForm({});
    }
  };

  const confirmDeleteVariable = async () => {
    if (variableToDelete) {
      await deleteVariable(variableToDelete.id);
      setVariableToDelete(null);
    }
  };

  const toggleEnabled = async variable => {
    await updateVariable(variable.id, {
      is_enabled: !variable.is_enabled,
    });
  };

  const toggleSecret = async variable => {
    await updateVariable(variable.id, {
      is_secret: !variable.is_secret,
    });
  };

  // Safety check to ensure variables is always an array
  const safeVariables = Array.isArray(variables) ? variables : [];

  if (safeVariables.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>📝</div>
        <h3>No variables yet</h3>
        <p>
          Add your first environment variable to start managing dynamic values
          in your API requests.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.variableList}>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkboxCol}>
                <input type="checkbox" title="Toggle all variables" disabled />
              </th>
              <th className={styles.keyCol}>Key</th>
              <th className={styles.valueCol}>Value</th>
              <th className={styles.descriptionCol}>Description</th>
              <th className={styles.typeCol}>Type</th>
              <th className={styles.actionsCol}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {safeVariables.map(variable => (
              <tr
                key={variable.id}
                className={`${styles.row} ${
                  !variable.is_enabled ? styles.disabled : ''
                }`}
              >
                {/* Enabled Checkbox */}
                <td className={styles.checkboxCell}>
                  <input
                    type="checkbox"
                    checked={variable.is_enabled}
                    onChange={() => toggleEnabled(variable)}
                    disabled={isLoading}
                    title={
                      variable.is_enabled
                        ? 'Disable variable'
                        : 'Enable variable'
                    }
                  />
                </td>

                {/* Key */}
                <td className={styles.keyCell}>
                  {editingVariable === variable.id ? (
                    <input
                      type="text"
                      value={editForm.key}
                      onChange={e =>
                        setEditForm({ ...editForm, key: e.target.value })
                      }
                      className={styles.input}
                      placeholder="Variable key"
                      maxLength={100}
                    />
                  ) : (
                    <div className={styles.keyDisplay}>
                      <span className={styles.keyText}>{variable.key}</span>
                      {!variable.is_enabled && (
                        <span className={styles.disabledIndicator}>
                          (disabled)
                        </span>
                      )}
                    </div>
                  )}
                </td>

                {/* Value */}
                <td className={styles.valueCell}>
                  {editingVariable === variable.id ? (
                    <div className={styles.valueInput}>
                      <input
                        type={editForm.is_secret ? 'password' : 'text'}
                        value={editForm.value}
                        onChange={e =>
                          setEditForm({ ...editForm, value: e.target.value })
                        }
                        className={styles.input}
                        placeholder="Variable value"
                        maxLength={1000}
                      />
                      <button
                        type="button"
                        className={styles.secretToggle}
                        onClick={() =>
                          setEditForm({
                            ...editForm,
                            is_secret: !editForm.is_secret,
                          })
                        }
                        title={editForm.is_secret ? 'Show value' : 'Hide value'}
                      >
                        {editForm.is_secret ? (
                          <svg
                            width="14"
                            height="14"
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
                        ) : (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M17.94 17.94C16.2306 19.2621 14.1491 19.9896 12 20C5 20 1 12 1 12C2.24389 9.68192 3.96914 7.65663 6.06 6.06M9.9 4.24C10.5883 4.0789 11.2931 3.99836 12 4C19 4 23 12 23 12C22.393 13.1356 21.6691 14.2048 20.84 15.19M14.12 14.12C13.8454 14.4148 13.5141 14.6512 13.1462 14.8151C12.7782 14.9791 12.3809 15.0673 11.9781 15.0744C11.5753 15.0815 11.1749 15.0074 10.8016 14.8565C10.4283 14.7056 10.0887 14.4811 9.80385 14.1962C9.51897 13.9113 9.29439 13.5717 9.14351 13.1984C8.99262 12.8251 8.91853 12.4247 8.92563 12.0219C8.93274 11.6191 9.02091 11.2218 9.18488 10.8538C9.34884 10.4858 9.58525 10.1546 9.88 9.88M3 3L21 21"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className={styles.valueDisplay}>
                      {variable.is_secret ? (
                        <span className={styles.secretValue}>***HIDDEN***</span>
                      ) : (
                        <span className={styles.valueText}>
                          {variable.value || (
                            <span className={styles.emptyValue}>(empty)</span>
                          )}
                        </span>
                      )}
                      {variable.is_secret && (
                        <span
                          className={styles.secretIcon}
                          title="Secret variable"
                        >
                          🔒
                        </span>
                      )}
                    </div>
                  )}
                </td>

                {/* Description */}
                <td className={styles.descriptionCell}>
                  {editingVariable === variable.id ? (
                    <input
                      type="text"
                      value={editForm.description}
                      onChange={e =>
                        setEditForm({
                          ...editForm,
                          description: e.target.value,
                        })
                      }
                      className={styles.input}
                      placeholder="Optional description"
                      maxLength={500}
                    />
                  ) : (
                    <span className={styles.descriptionText}>
                      {variable.description || (
                        <span className={styles.emptyDescription}>
                          No description
                        </span>
                      )}
                    </span>
                  )}
                </td>

                {/* Type */}
                <td className={styles.typeCell}>
                  {variable.is_secret ? (
                    <span className={styles.secretBadge}>Secret</span>
                  ) : (
                    <span className={styles.publicBadge}>Public</span>
                  )}
                </td>

                {/* Actions */}
                <td className={styles.actionsCell}>
                  {editingVariable === variable.id ? (
                    <div className={styles.editActions}>
                      <button
                        className={styles.actionButton}
                        onClick={() => saveVariable(variable.id)}
                        disabled={isLoading}
                        title="Save changes"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"
                            fill="currentColor"
                          />
                        </svg>
                      </button>
                      <button
                        className={styles.actionButton}
                        onClick={cancelEditing}
                        disabled={isLoading}
                        title="Cancel editing"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M18 6L6 18M6 6L18 18"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className={styles.viewActions}>
                      <button
                        className={styles.actionButton}
                        onClick={() => startEditing(variable)}
                        disabled={isLoading}
                        title="Edit variable"
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
                      </button>
                      <button
                        className={`${styles.actionButton} ${styles.deleteButton}`}
                        onClick={() => setVariableToDelete(variable)}
                        disabled={isLoading}
                        title="Delete variable"
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Modal */}
      {variableToDelete && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3>Delete Variable</h3>
            </div>
            <div className={styles.modalBody}>
              <p>
                Are you sure you want to delete the variable{' '}
                <strong>"{variableToDelete.key}"</strong>?
              </p>
              <p className={styles.warning}>
                This action cannot be undone. Any API requests using this
                variable will no longer resolve this value.
              </p>
            </div>
            <div className={styles.modalFooter}>
              <button
                className={styles.cancelButton}
                onClick={() => setVariableToDelete(null)}
              >
                Cancel
              </button>
              <button
                className={styles.deleteButton}
                onClick={confirmDeleteVariable}
                disabled={isLoading}
              >
                Delete Variable
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
