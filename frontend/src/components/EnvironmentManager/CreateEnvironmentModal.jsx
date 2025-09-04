import { useState } from 'react';
import { Button } from '../common';
import styles from './CreateEnvironmentModal.module.css';

export default function CreateEnvironmentModal({ onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_active: false,
    includeDefaults: true, // New option to include default variables
  });
  const [errors, setErrors] = useState({});

  const handleSubmit = e => {
    e.preventDefault();

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
      const environmentData = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        is_active: formData.is_active,
      };

      // Add default variables if requested
      if (formData.includeDefaults) {
        environmentData.defaultVariables = [
          {
            key: 'BASE_URL',
            value: 'http://localhost:3000',
            description: 'Base URL for API requests',
            is_enabled: true,
            is_secret: false,
          },
          {
            key: 'API_KEY',
            value: '',
            description: 'API authentication key',
            is_enabled: true,
            is_secret: true,
          },
          {
            key: 'AUTH_TOKEN',
            value: '',
            description: 'Authentication token',
            is_enabled: true,
            is_secret: true,
          },
          {
            key: 'TIMEOUT',
            value: '30000',
            description: 'Request timeout in milliseconds',
            is_enabled: true,
            is_secret: false,
          },
        ];
      }

      onSave(environmentData);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData({ ...formData, [field]: value });

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors({ ...errors, [field]: null });
    }
  };

  return (
    <div className={styles.modal} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Create New Environment</h2>
          <button
            className={styles.closeButton}
            onClick={onClose}
            type="button"
          >
            <svg
              width="20"
              height="20"
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

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="env-name" className={styles.label}>
              Environment Name *
            </label>
            <input
              id="env-name"
              type="text"
              value={formData.name}
              onChange={e => handleInputChange('name', e.target.value)}
              className={`${styles.input} ${errors.name ? styles.error : ''}`}
              placeholder="e.g., Development, Production, Staging"
              maxLength={100}
              autoFocus
            />
            {errors.name && (
              <span className={styles.errorText}>{errors.name}</span>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="env-description" className={styles.label}>
              Description
            </label>
            <textarea
              id="env-description"
              value={formData.description}
              onChange={e => handleInputChange('description', e.target.value)}
              className={`${styles.textarea} ${errors.description ? styles.error : ''}`}
              placeholder="Optional description for this environment"
              rows={3}
              maxLength={500}
            />
            {errors.description && (
              <span className={styles.errorText}>{errors.description}</span>
            )}
            <div className={styles.charCount}>
              {formData.description.length}/500
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={e => handleInputChange('is_active', e.target.checked)}
                className={styles.checkbox}
              />
              <span className={styles.checkboxText}>
                Set as active environment
              </span>
            </label>
            <div className={styles.fieldHelp}>
              If enabled, this environment will be used for variable resolution
              in API requests. Any currently active environment will be
              deactivated.
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={formData.includeDefaults}
                onChange={e =>
                  handleInputChange('includeDefaults', e.target.checked)
                }
                className={styles.checkbox}
              />
              <span className={styles.checkboxText}>
                Include common variables
              </span>
            </label>
            <div className={styles.fieldHelp}>
              Automatically add common variables like BASE_URL, API_KEY,
              AUTH_TOKEN, and TIMEOUT to get started quickly.
            </div>
          </div>

          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!formData.name.trim()}
            >
              Create Environment
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
