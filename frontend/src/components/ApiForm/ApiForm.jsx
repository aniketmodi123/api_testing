import { useEffect, useState } from 'react';
import { useApi } from '../../store/api';
import styles from './ApiForm.module.css';

/**
 * Component for creating or editing an API
 */
const ApiForm = ({
  fileId,
  apiId = null,
  onSave = () => {},
  onCancel = () => {},
}) => {
  const [formData, setFormData] = useState({
    name: '',
    method: 'GET',
    endpoint: '',
    description: '',
    version: 'v1',
    is_active: true,
    extra_meta: {},
  });

  const { createApi, getApi, updateApi, isLoading, error, activeApi } =
    useApi();

  // Load API data if editing an existing API
  useEffect(() => {
    const loadApi = async () => {
      if (apiId) {
        try {
          await getApi(apiId);
        } catch (err) {
          console.error('Failed to load API:', err);
        }
      }
    };

    loadApi();
  }, [apiId, getApi]);

  // Update form when activeApi changes
  useEffect(() => {
    if (activeApi && apiId) {
      setFormData({
        name: activeApi.name || '',
        method: activeApi.method || 'GET',
        endpoint: activeApi.endpoint || '',
        description: activeApi.description || '',
        version: activeApi.version || 'v1',
        is_active: activeApi.is_active ?? true,
        extra_meta: activeApi.extra_meta || {},
      });
    }
  }, [activeApi, apiId]);

  // Handle form input changes
  const handleChange = e => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  // Handle extra_meta changes (JSON field)
  const handleMetaChange = e => {
    try {
      const metaValue = e.target.value ? JSON.parse(e.target.value) : {};
      setFormData(prev => ({
        ...prev,
        extra_meta: metaValue,
      }));
    } catch (err) {
      // Don't update if invalid JSON
      console.error('Invalid JSON for extra_meta:', err);
    }
  };

  // Handle form submission
  const handleSubmit = async e => {
    e.preventDefault();

    try {
      let result;

      if (apiId) {
        // Update existing API
        result = await updateApi(apiId, formData);
      } else {
        // Create new API
        result = await createApi(fileId, formData);
      }

      onSave(result?.data);
    } catch (err) {
      console.error('Error saving API:', err);
    }
  };

  return (
    <div className={styles.formContainer}>
      <h2>{apiId ? 'Edit API' : 'Create New API'}</h2>

      {error && <div className={styles.error}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className={styles.formGroup}>
          <label htmlFor="name">API Name</label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            placeholder="Enter API name"
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="method">HTTP Method</label>
          <select
            id="method"
            name="method"
            value={formData.method}
            onChange={handleChange}
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
            <option value="PATCH">PATCH</option>
          </select>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="endpoint">Endpoint</label>
          <input
            type="text"
            id="endpoint"
            name="endpoint"
            value={formData.endpoint}
            onChange={handleChange}
            required
            placeholder="/api/resource"
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="API description"
            rows={3}
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="version">Version</label>
          <input
            type="text"
            id="version"
            name="version"
            value={formData.version}
            onChange={handleChange}
            placeholder="v1"
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              name="is_active"
              checked={formData.is_active}
              onChange={handleChange}
            />
            <span>Active</span>
          </label>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="extra_meta">Extra Metadata (JSON)</label>
          <textarea
            id="extra_meta"
            name="extra_meta"
            value={JSON.stringify(formData.extra_meta, null, 2)}
            onChange={handleMetaChange}
            placeholder="{}"
            rows={5}
          />
        </div>

        <div className={styles.formActions}>
          <button
            type="button"
            onClick={onCancel}
            className={styles.cancelButton}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={styles.saveButton}
            disabled={isLoading}
          >
            {isLoading ? 'Saving...' : apiId ? 'Update API' : 'Create API'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ApiForm;
