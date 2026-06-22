import { useEffect, useState } from 'react';
import AssertionBuilder from '../AssertionBuilder';
import {
  useBulkCreateTestCasesMutation,
  useGetApiQuery,
  useGetTestCaseDetailsQuery,
  useGetTestCaseQuery,
  useSaveTestCaseMutation,
} from '../../store/apiSlice';
import { Button, JsonEditor } from '../common';
import styles from './TestCaseForm.module.css';

// Utility function to add ngrok headers if needed
const addNgrokHeadersIfNeeded = (apiData, existingHeaders = {}) => {
  const endpoint = apiData?.endpoint || apiData?.url;
  const isNgrokUrl =
    endpoint &&
    (endpoint.includes('.ngrok.') || endpoint.includes('ngrok-free.app'));

  if (isNgrokUrl) {
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

  // Server reads from the single RTK Query cache; new-case ngrok headers need the
  // file's api record, edit mode needs the case + its details.
  const { data: activeApi } = useGetApiQuery(
    { fileId, includeCases: true },
    { skip: !fileId }
  );
  const { data: selectedTestCase } = useGetTestCaseQuery(caseId, {
    skip: !caseId,
  });
  const { data: testCaseDetails } = useGetTestCaseDetailsQuery(caseId, {
    skip: !caseId,
  });

  const [saveTestCase, { isLoading: isSaving, error: saveError }] =
    useSaveTestCaseMutation();
  const [bulkCreateTestCases, { isLoading: isBulkSaving, error: bulkError }] =
    useBulkCreateTestCasesMutation();

  const isLoading = isSaving || isBulkSaving;
  const error =
    saveError || bulkError
      ? (saveError || bulkError)?.data?.error_message || 'Failed to save test case'
      : null;

  // Auto-add ngrok headers for new test cases
  useEffect(() => {
    if (activeApi && !caseId) {
      // Only for new test cases
      const enhancedHeaders = addNgrokHeadersIfNeeded(activeApi, {});
      if (Object.keys(enhancedHeaders).length > 0) {
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
      const saved = await bulkCreateTestCases({ fileId, testCases }).unwrap();
      onSave(saved);
    } catch (err) {
      console.error('Error bulk importing test cases:', err);
      setBulkImportError(err.message || 'Failed to bulk import test cases');
    }
  };

  // Handle form submission
  const handleSubmit = async e => {
    e.preventDefault();

    try {
      // Use the unified saveTestCase mutation that handles both create and update.
      // Passing fileId fires the optimistic cache patch (Sprint 3).
      const saved = await saveTestCase({ fileId, caseId, ...formData }).unwrap();
      onSave(saved);
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
            <AssertionBuilder
              value={formData.expected}
              onChange={val => {
                setFormData(prev => ({ ...prev, expected: val }));
                setJsonStrings(prev => ({ ...prev, expected: JSON.stringify(val, null, 2) }));
              }}
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
