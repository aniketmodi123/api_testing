import { useEffect, useState } from 'react';
import { useApi } from '../../store/api';
import { Button, JsonEditor } from '../common';
import styles from './TestCaseForm.module.css';

// Utility function to add ngrok headers if needed
const addNgrokHeadersIfNeeded = (apiData, existingHeaders = {}) => {
  const endpoint = apiData?.endpoint || apiData?.url;
  const isNgrokUrl =
    endpoint &&
    (endpoint.includes('.ngrok.') || endpoint.includes('ngrok-free.app'));

  if (isNgrokUrl) {
    console.log(
      '🔗 TestCaseForm: Adding ngrok headers for endpoint:',
      endpoint
    );
    return {
      'ngrok-skip-browser-warning': 'true',
      'User-Agent': 'API-Testing-Tool/1.0',
      ...existingHeaders, // Keep user's headers last to allow overrides
    };
  }

  return existingHeaders;
};

/**
 * Component for creating or editing a test case
 */
const TestCaseForm = ({
  fileId,
  caseId = null,
  onSave = () => {},
  onCancel = () => {},
  isInDrawer = false,
}) => {
  const [formData, setFormData] = useState({
    name: '',
    headers: {},
    params: {},
    body: {},
    expected: {},
  });

  // Store raw JSON strings for editing
  const [jsonStrings, setJsonStrings] = useState({
    headers: '{}',
    params: '{}',
    body: '{}',
    expected: '{}',
  });

  const [bulkImportMode, setBulkImportMode] = useState(false);
  const [bulkImportJson, setBulkImportJson] = useState('');
  const [bulkImportError, setBulkImportError] = useState('');

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
    bulkCreateTestCases,
    getApi,
    activeApi,
  } = useApi();

  // Load API data for new test cases to auto-add ngrok headers
  useEffect(() => {
    const loadApiData = async () => {
      if (fileId && !caseId) {
        // Only for new test cases
        try {
          await getApi(fileId);
        } catch (err) {
          console.error('Failed to load API data for test case:', err);
        }
      }
    };

    loadApiData();
  }, [fileId, caseId, getApi]);

  // Auto-add ngrok headers for new test cases
  useEffect(() => {
    if (activeApi && !caseId) {
      // Only for new test cases
      const enhancedHeaders = addNgrokHeadersIfNeeded(activeApi, {});
      if (Object.keys(enhancedHeaders).length > 0) {
        console.log(
          '🔗 TestCaseForm: Auto-adding ngrok headers for new test case'
        );
        setFormData(prev => ({
          ...prev,
          headers: enhancedHeaders,
        }));
        setJsonStrings(prev => ({
          ...prev,
          headers: JSON.stringify(enhancedHeaders, null, 2),
        }));
      }
    }
  }, [activeApi, caseId]);

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
        params: selectedTestCase.params || {},
        body: selectedTestCase.body || {},
        expected: selectedTestCase.expected || {},
      });

      // Update JSON strings for editing
      setJsonStrings({
        headers: JSON.stringify(selectedTestCase.headers || {}, null, 2),
        params: JSON.stringify(selectedTestCase.params || {}, null, 2),
        body: JSON.stringify(selectedTestCase.body || {}, null, 2),
        expected: JSON.stringify(selectedTestCase.expected || {}, null, 2),
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
    // Always update the raw string so user can edit freely
    setJsonStrings(prev => ({
      ...prev,
      [field]: value,
    }));

    // Try to parse and update the actual data
    try {
      const jsonValue = value ? JSON.parse(value) : {};
      setFormData(prev => ({
        ...prev,
        [field]: jsonValue,
      }));
    } catch (err) {
      // Don't update formData if invalid JSON, but keep the string for editing
      console.warn(`Invalid JSON for ${field}:`, err.message);
    }
  };

  // Handle bulk import JSON change
  const handleBulkImportChange = e => {
    setBulkImportJson(e.target.value);
    setBulkImportError('');
  };

  // Toggle between normal mode and bulk import mode
  const toggleBulkImportMode = () => {
    setBulkImportMode(!bulkImportMode);
    setBulkImportError('');
  };

  // Handle bulk import submission
  const handleBulkImport = async () => {
    try {
      // Parse the JSON array
      let testCases;
      try {
        testCases = JSON.parse(bulkImportJson);
        if (!Array.isArray(testCases)) {
          testCases = [testCases]; // Convert single object to array
        }
      } catch (err) {
        setBulkImportError(
          'Invalid JSON format. Please provide a valid JSON array.'
        );
        return;
      }

      // Validate each test case has required fields
      for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        if (!testCase.name) {
          setBulkImportError(`Test case at index ${i} is missing a name.`);
          return;
        }
      }

      // Send the bulk create request
      const result = await bulkCreateTestCases(fileId, testCases);
      onSave(result?.data);
    } catch (err) {
      console.error('Error bulk importing test cases:', err);
      setBulkImportError(err.message || 'Failed to bulk import test cases');
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

  // Adapt styles based on whether the component is in a drawer
  const containerStyle = isInDrawer
    ? {
        padding: '0',
        backgroundColor: 'transparent',
      }
    : {};

  return (
    <div className={styles.formContainer} style={containerStyle}>
      <div className={styles.formHeader}>
        <h2>{caseId ? 'Edit Test Case' : 'Create New Test Case'}</h2>
        {!caseId &&
          !isInDrawer && ( // Only show bulk import toggle in create mode and not in drawer
            <Button
              variant="secondary"
              size="small"
              onClick={toggleBulkImportMode}
            >
              {bulkImportMode ? 'Single Case Mode' : 'Bulk Import Mode'}
            </Button>
          )}
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {bulkImportError && <div className={styles.error}>{bulkImportError}</div>}

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

      {bulkImportMode && !caseId ? (
        <div className={styles.bulkImportContainer}>
          <div className={styles.formGroup}>
            <label htmlFor="bulkImport">Bulk Import JSON</label>
            <textarea
              id="bulkImport"
              name="bulkImport"
              value={bulkImportJson}
              onChange={handleBulkImportChange}
              placeholder={`[
  {
    "name": "Test Case 1",
    "headers": {"Content-Type": "application/json"},
    "params": {"param1": "value1"},
    "body": {"key": "value"},
    "expected": {"status": "success"}
  },
  {
    "name": "Test Case 2",
    "headers": {"Content-Type": "application/json"},
    "params": {"param2": "value2"},
    "body": {"key": "value"},
    "expected": {"status": "success"}
  }
]`}
              rows={15}
              className={styles.jsonEditor}
              required
            />
            <div className={styles.bulkImportHelp}>
              <p>
                Paste a JSON array of test cases to bulk import. Each test case
                should have:
                <code>name</code>, <code>headers</code>, <code>params</code>,{' '}
                <code>body</code>, and <code>expected</code> fields.
              </p>
            </div>
          </div>
          <div className={styles.formActions}>
            <Button variant="secondary" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleBulkImport}
              disabled={isLoading}
            >
              {isLoading ? 'Importing...' : 'Import Test Cases'}
            </Button>
          </div>
        </div>
      ) : (
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
            <JsonEditor
              value={jsonStrings.headers}
              onChange={value => handleJsonChange('headers', value)}
              placeholder='{"Content-Type": "application/json"}'
              minHeight={120}
              className={styles.jsonEditor}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="params">Query Params (JSON)</label>
            <JsonEditor
              value={jsonStrings.params}
              onChange={value => handleJsonChange('params', value)}
              placeholder='{"search": "value", "limit": 10}'
              minHeight={100}
              className={styles.jsonEditor}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="body">Request Body (JSON)</label>
            <JsonEditor
              value={jsonStrings.body}
              onChange={value => handleJsonChange('body', value)}
              placeholder="{}"
              minHeight={160}
              className={styles.jsonEditor}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="expected">Expected Response (JSON)</label>
            <JsonEditor
              value={jsonStrings.expected}
              onChange={value => handleJsonChange('expected', value)}
              placeholder="{}"
              minHeight={160}
              className={styles.jsonEditor}
              required
            />
          </div>

          <div className={styles.formActions}>
            <Button variant="secondary" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isLoading}>
              {isLoading
                ? 'Saving...'
                : caseId
                  ? 'Update Test Case'
                  : 'Create Test Case'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};

export default TestCaseForm;
