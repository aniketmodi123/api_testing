import { useState } from 'react';
import { Button } from '../common';
import styles from './EnvironmentForm.module.css';

export default function EnvironmentForm({
  onCancel,
  onSave,
  initialData = null,
  isEdit = false,
}) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    description: initialData?.description || '',
    is_active: initialData?.is_active || false,
    includeDefaults: !isEdit, // Only show include defaults for new environments
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');

  const handleSubmit = async e => {
    e.preventDefault();
    setApiError(''); // Clear previous API errors

    const newErrors = {};

    // Validate name
    if (!formData.name.trim()) {
      newErrors.name = 'Environment name is required';
    } else if (formData.name.length > 100) {
      newErrors.name = 'Environment name must be 100 characters or less';
    }

    // Validate description
    if (formData.description && formData.description.length > 500) {
      newErrors.description = 'Description must be 500 characters or less';
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      setIsSubmitting(true);

      const environmentData = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        is_active: formData.is_active,
      };

      // Add default variables if requested (only for new environments)
      if (!isEdit && formData.includeDefaults) {
        environmentData.includeDefaults = true;
      }

      console.log('📝 Form data being submitted:', {
        formName: formData.name,
        formDescription: formData.description,
        includeDefaults: formData.includeDefaults,
        finalEnvironmentData: environmentData,
      });

      try {
        const result = await onSave(environmentData, setApiError);
        if (result !== false) {
          // Success - parent will handle navigation
          return;
        }
      } catch (error) {
        console.error('Failed to save environment:', error);
        setApiError('Failed to save environment. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
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
    <div className={styles.environmentForm}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <h2 className={styles.title}>
            {isEdit ? 'Edit Environment' : 'Create New Environment'}
          </h2>
          <p className={styles.subtitle}>
            {isEdit
              ? 'Update the environment settings below.'
              : 'Set up a new environment for your API testing workflow.'}
          </p>
        </div>
      </div>

      {/* Form Content */}
      <div className={styles.content}>
        <form onSubmit={handleSubmit} className={styles.form}>
          {/* API Error */}
          {apiError && (
            <div className={styles.apiError}>
              <div className={styles.errorIcon}>⚠️</div>
              <div className={styles.errorContent}>
                <div className={styles.errorTitle}>Error</div>
                <div className={styles.errorMessage}>{apiError}</div>
              </div>
            </div>
          )}

          <div className={styles.formSection}>
            <h3 className={styles.sectionTitle}>Basic Information</h3>

            {/* Environment Name */}
            <div className={styles.field}>
              <label htmlFor="env-name" className={styles.label}>
                Environment Name *
              </label>
              <input
                id="env-name"
                type="text"
                value={formData.name}
                onChange={e => handleInputChange('name', e.target.value)}
                className={`${styles.input} ${errors.name ? styles.inputError : ''}`}
                placeholder="e.g., Development, Staging, Production"
                maxLength={100}
                disabled={isSubmitting}
              />
              {errors.name && (
                <div className={styles.fieldError}>{errors.name}</div>
              )}
            </div>

            {/* Environment Description */}
            <div className={styles.field}>
              <label htmlFor="env-description" className={styles.label}>
                Description <span className={styles.optional}>(optional)</span>
              </label>
              <textarea
                id="env-description"
                value={formData.description}
                onChange={e => handleInputChange('description', e.target.value)}
                className={`${styles.textarea} ${errors.description ? styles.inputError : ''}`}
                placeholder="Describe the purpose and scope of this environment..."
                rows={4}
                maxLength={500}
                disabled={isSubmitting}
              />
              {errors.description && (
                <div className={styles.fieldError}>{errors.description}</div>
              )}
              <div className={styles.charCount}>
                {formData.description.length}/500 characters
              </div>
            </div>
          </div>

          {!isEdit && (
            <div className={styles.formSection}>
              <h3 className={styles.sectionTitle}>Initial Setup</h3>

              {/* Include Default Variables */}
              <div className={styles.checkboxField}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={formData.includeDefaults}
                    onChange={e =>
                      handleInputChange('includeDefaults', e.target.checked)
                    }
                    className={styles.checkbox}
                    disabled={isSubmitting}
                  />
                  <span className={styles.checkboxText}>
                    Include default variables
                  </span>
                </label>
                <div className={styles.checkboxDescription}>
                  Add common variables like urls for deffrent setup and username
                  to get started quickly
                </div>
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className={styles.actions}>
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || !formData.name.trim()}
            >
              {isSubmitting
                ? 'Saving...'
                : isEdit
                  ? 'Update Environment'
                  : 'Create Environment'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
