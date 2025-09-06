import { useEffect, useState } from 'react';
import { useEnvironment } from '../../store/environment';
import { Button } from '../common';
import styles from './VariableModal.module.css';

export default function VariableModal({
  environment,
  onClose,
  editingVariable = null, // null for create, variable object for edit
}) {
  const {
    createVariable,
    updateVariable,
    validateVariableKey,
    isLoading,
    variables,
  } = useEnvironment();

  const isEditMode = !!editingVariable;

  // Form state
  const [formData, setFormData] = useState({
    key: '',
    value: '',
    description: '',
    is_enabled: true,
    is_secret: false,
  });

  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');

  // Initialize form data
  useEffect(() => {
    if (isEditMode && editingVariable) {
      setFormData({
        key: editingVariable.key,
        value: editingVariable.value || '',
        description: editingVariable.description || '',
        is_enabled: editingVariable.is_enabled,
        is_secret: editingVariable.is_secret,
      });
    } else {
      setFormData({
        key: '',
        value: '',
        description: '',
        is_enabled: true,
        is_secret: false,
      });
    }
    setErrors({});
    setApiError('');
  }, [isEditMode, editingVariable]);

  const handleSubmit = async e => {
    e.preventDefault();
    setApiError('');

    const newErrors = {};

    // Validate key
    if (!formData.key.trim()) {
      newErrors.key = 'Variable key is required';
    } else if (!validateVariableKey(formData.key)) {
      newErrors.key =
        'Invalid key format. Keys must start with a letter or underscore and contain only letters, numbers, underscores, and hyphens.';
    } else {
      // Check for duplicate keys (exclude current variable if editing)
      const existingVariable = variables.find(
        v =>
          v.key === formData.key && (!isEditMode || v.id !== editingVariable.id)
      );
      if (existingVariable) {
        newErrors.key =
          'A variable with this key already exists in this environment';
      }
    }

    // Validate value length
    if (formData.value && formData.value.length > 1000) {
      newErrors.value = 'Value must be 1000 characters or less';
    }

    // Validate description length
    if (formData.description && formData.description.length > 500) {
      newErrors.description = 'Description must be 500 characters or less';
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      return;
    }

    try {
      if (isEditMode) {
        await updateVariable(editingVariable.id, formData, environment.id);
      } else {
        await createVariable(formData, environment.id);
      }
      onClose();
    } catch (error) {
      setApiError(
        error.response?.data?.error_message ||
          error.message ||
          `Failed to ${isEditMode ? 'update' : 'create'} variable`
      );
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <div className={styles.modal}>
      <div className={styles.modalContent}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <h3>{isEditMode ? 'Edit Variable' : 'Add New Variable'}</h3>
          <p>
            {isEditMode
              ? `Modify the variable in ${environment.name}`
              : `Create a new environment variable for ${environment.name}`}
          </p>
        </div>

        {/* Error Display */}
        {apiError && (
          <div className={styles.errorAlert}>
            <span className={styles.errorIcon}>⚠️</span>
            <span>{apiError}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formBody}>
            {/* Variable Key */}
            <div className={styles.formGroup}>
              <label className={styles.label}>
                Variable Key <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                value={formData.key}
                onChange={e => handleInputChange('key', e.target.value)}
                className={`${styles.input} ${errors.key ? styles.inputError : ''}`}
                placeholder="e.g., API_BASE_URL, DATABASE_HOST"
                maxLength={255}
                autoFocus={!isEditMode}
              />
              {errors.key && (
                <span className={styles.errorText}>{errors.key}</span>
              )}
              <span className={styles.helpText}>
                Must start with a letter or underscore, and contain only
                letters, numbers, underscores, and hyphens
              </span>
            </div>

            {/* Variable Value */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Variable Value</label>
              <textarea
                value={formData.value}
                onChange={e => handleInputChange('value', e.target.value)}
                className={`${styles.textarea} ${errors.value ? styles.inputError : ''}`}
                placeholder="Enter the variable value..."
                rows={4}
                maxLength={1000}
              />
              {errors.value && (
                <span className={styles.errorText}>{errors.value}</span>
              )}
              <span className={styles.helpText}>
                The value that will be substituted when using this variable in
                requests
              </span>
            </div>

            {/* Description */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Description</label>
              <textarea
                value={formData.description}
                onChange={e => handleInputChange('description', e.target.value)}
                className={`${styles.textarea} ${errors.description ? styles.inputError : ''}`}
                placeholder="Describe what this variable is used for..."
                rows={2}
                maxLength={500}
              />
              {errors.description && (
                <span className={styles.errorText}>{errors.description}</span>
              )}
              <span className={styles.helpText}>
                Optional description to help identify the purpose of this
                variable
              </span>
            </div>

            {/* Options */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Options</label>
              <div className={styles.checkboxGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={formData.is_enabled}
                    onChange={e =>
                      handleInputChange('is_enabled', e.target.checked)
                    }
                    className={styles.checkbox}
                  />
                  <span className={styles.checkboxText}>
                    <strong>Enabled</strong>
                    <span className={styles.checkboxDescription}>
                      When enabled, this variable can be used in API requests
                    </span>
                  </span>
                </label>

                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={formData.is_secret}
                    onChange={e =>
                      handleInputChange('is_secret', e.target.checked)
                    }
                    className={styles.checkbox}
                  />
                  <span className={styles.checkboxText}>
                    <strong>Secret</strong>
                    <span className={styles.checkboxDescription}>
                      Hide the value in the interface (recommended for
                      passwords, tokens, etc.)
                    </span>
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className={styles.modalFooter}>
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isLoading || !formData.key.trim()}
            >
              {isLoading
                ? isEditMode
                  ? 'Updating...'
                  : 'Creating...'
                : isEditMode
                  ? 'Update Variable'
                  : 'Create Variable'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
