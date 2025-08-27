import { useEffect, useState } from 'react';
import { useApi } from '../../store/api';
import styles from './TestCaseForm.module.css';

/**
 * Component for creating or editing a test case
 */
const TestCaseForm = ({
  fileId,
  caseId = null,
  onSave = () => {},
  onCancel = () => {},
}) => {
  const [formData, setFormData] = useState({
    name: '',
    headers: {},
    body: {},
    expected: {},
  });

  const {
    createTestCase,
    getTestCases,
    updateTestCase,
    selectedTestCase,
    isLoading,
    error,
    selectTestCase,
    saveTestCase,
    testCaseDetails,
  } = useApi();

  // Load test case data if editing an existing case
  useEffect(() => {
    const loadTestCase = async () => {
      if (caseId) {
        try {
          await selectTestCase(caseId);
        } catch (err) {
          console.error('Failed to load test case:', err);
        }
      }
    };

    loadTestCase();
  }, [caseId, selectTestCase]);

  // Update form when selectedTestCase changes
  useEffect(() => {
    if (selectedTestCase && caseId) {
      setFormData({
        name: selectedTestCase.name || '',
        headers: selectedTestCase.headers || {},
        body: selectedTestCase.body || {},
        expected: selectedTestCase.expected || {},
      });
    }
  }, [selectedTestCase, caseId]);

  // Handle form input changes
  const handleChange = e => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle JSON field changes
  const handleJsonChange = (field, value) => {
    try {
      const jsonValue = value ? JSON.parse(value) : {};
      setFormData(prev => ({
        ...prev,
        [field]: jsonValue,
      }));
    } catch (err) {
      // Don't update if invalid JSON
      console.error(`Invalid JSON for ${field}:`, err);
    }
  };

  // Handle form submission
  const handleSubmit = async e => {
    e.preventDefault();

    try {
      // Use the unified saveTestCase function that handles both create and update
      const result = await saveTestCase(fileId, formData, caseId);
      onSave(result?.data);
    } catch (err) {
      console.error('Error saving test case:', err);
    }
  };

  return (
    <div className={styles.formContainer}>
      <h2>{caseId ? 'Edit Test Case' : 'Create New Test Case'}</h2>

      {error && <div className={styles.error}>{error}</div>}

      {/* Display detailed test case info if available */}
      {caseId && testCaseDetails && (
        <div className={styles.detailedInfoSection}>
          <h3>Test Case Details</h3>
          <div className={styles.detailGrid}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Created:</span>
              <span className={styles.detailValue}>
                {new Date(testCaseDetails.created_at).toLocaleString()}
              </span>
            </div>
          </div>

          {testCaseDetails.description && (
            <div className={styles.description}>
              <h5>Description:</h5>
              <p>{testCaseDetails.description}</p>
            </div>
          )}

          {testCaseDetails.execution_history &&
            testCaseDetails.execution_history.length > 0 && (
              <div className={styles.executionHistory}>
                <h5>Execution History:</h5>
                <table className={styles.historyTable}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Result</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testCaseDetails.execution_history.map((history, idx) => (
                      <tr key={idx}>
                        <td>
                          {new Date(history.execution_time).toLocaleString()}
                        </td>
                        <td
                          className={
                            history.success ? styles.success : styles.failure
                          }
                        >
                          {history.success ? 'PASS' : 'FAIL'}
                        </td>
                        <td>{history.duration || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className={styles.formGroup}>
          <label htmlFor="name">Test Case Name</label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            placeholder="Enter test case name"
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="headers">Headers (JSON)</label>
          <textarea
            id="headers"
            name="headers"
            value={JSON.stringify(formData.headers, null, 2)}
            onChange={e => handleJsonChange('headers', e.target.value)}
            placeholder='{"Content-Type": "application/json"}'
            rows={5}
            className={styles.jsonEditor}
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="body">Request Body (JSON)</label>
          <textarea
            id="body"
            name="body"
            value={JSON.stringify(formData.body, null, 2)}
            onChange={e => handleJsonChange('body', e.target.value)}
            placeholder="{}"
            rows={8}
            className={styles.jsonEditor}
            required
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="expected">Expected Response (JSON)</label>
          <textarea
            id="expected"
            name="expected"
            value={JSON.stringify(formData.expected, null, 2)}
            onChange={e => handleJsonChange('expected', e.target.value)}
            placeholder="{}"
            rows={8}
            className={styles.jsonEditor}
            required
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
            {isLoading
              ? 'Saving...'
              : caseId
                ? 'Update Test Case'
                : 'Create Test Case'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default TestCaseForm;
