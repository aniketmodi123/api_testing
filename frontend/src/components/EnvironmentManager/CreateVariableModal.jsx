import { useState } from 'react';
import { useEnvironment } from '../../store/environment';
import { Button } from '../common';
import styles from './CreateVariableModal.module.css';

export default function CreateVariableModal({
  environmentId,
  existingKeys = [],
  onClose,
}) {
  const { createVariable, validateVariableKey } = useEnvironment();

  const [formData, setFormData] = useState({
    key: '',
    value: '',
    description: '',
    is_enabled: true,
    is_secret: false,
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();

    const newErrors = {};

    // Validate key
    if (!formData.key.trim()) {
      newErrors.key = 'Variable key is required';
    } else if (!validateVariableKey(formData.key)) {
      newErrors.key =
        'Invalid key format. Keys must start with a letter or underscore and contain only letters, numbers, underscores, and hyphens.';
    } else if (existingKeys.includes(formData.key)) {
      newErrors.key =
        'A variable with this key already exists in this environment';
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

    if (Object.keys(newErrors).length === 0) {
      setIsSubmitting(true);

      const success = await createVariable(
        {
          key: formData.key.trim(),
          value: formData.value || null,
          description: formData.description.trim() || null,
          is_enabled: formData.is_enabled,
          is_secret: formData.is_secret,
        },
        environmentId
      );

      setIsSubmitting(false);

      if (success) {
        onClose();
      }
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
          <h2>Add Environment Variable</h2>
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
            <label htmlFor="var-key" className={styles.label}>
              Variable Key *
            </label>
            <input
              id="var-key"
              type="text"
              value={formData.key}
              onChange={e => handleInputChange('key', e.target.value)}
              className={`${styles.input} ${styles.keyInput} ${errors.key ? styles.error : ''}`}
              placeholder="e.g., API_URL, BASE_URL, API_KEY"
              maxLength={100}
              autoFocus
            />
            {errors.key && (
              <span className={styles.errorText}>{errors.key}</span>
            )}
            <div className={styles.fieldHelp}>
              Use uppercase letters, numbers, underscores, and hyphens. Must
              start with a letter or underscore.
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="var-value" className={styles.label}>
              Variable Value
            </label>
            <div className={styles.valueInputWrapper}>
              <input
                id="var-value"
                type={formData.is_secret ? 'password' : 'text'}
                value={formData.value}
                onChange={e => handleInputChange('value', e.target.value)}
                className={`${styles.input} ${errors.value ? styles.error : ''}`}
                placeholder="Enter the variable value"
                maxLength={1000}
              />
              <button
                type="button"
                className={styles.toggleButton}
                onClick={() =>
                  handleInputChange('is_secret', !formData.is_secret)
                }
                title={
                  formData.is_secret ? 'Show value' : 'Hide value as secret'
                }
              >
                {formData.is_secret ? (
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
                ) : (
                  <svg
                    width="16"
                    height="16"
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
            {errors.value && (
              <span className={styles.errorText}>{errors.value}</span>
            )}
            {formData.is_secret && (
              <div className={styles.secretWarning}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Secret values will be masked in the interface and are only
                visible during editing.
              </div>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="var-description" className={styles.label}>
              Description
            </label>
            <textarea
              id="var-description"
              value={formData.description}
              onChange={e => handleInputChange('description', e.target.value)}
              className={`${styles.textarea} ${errors.description ? styles.error : ''}`}
              placeholder="Optional description for this variable"
              rows={2}
              maxLength={500}
            />
            {errors.description && (
              <span className={styles.errorText}>{errors.description}</span>
            )}
            <div className={styles.charCount}>
              {formData.description.length}/500
            </div>
          </div>

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
              <span className={styles.checkboxText}>Enable this variable</span>
            </label>
            <div className={styles.fieldHelp}>
              Disabled variables won't be resolved in API requests.
            </div>
          </div>

          <div className={styles.actions}>
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!formData.key.trim() || isSubmitting}
            >
              {isSubmitting ? 'Adding...' : 'Add Variable'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
