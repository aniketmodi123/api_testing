import { useEffect, useState } from 'react';
import { useApi } from '../../store/api';
import styles from './TestRunner.module.css';

// Copy to clipboard utility function
const copyToClipboard = async text => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    return false;
  }
};

// Reusable copy button component
const CopyButton = ({ textToCopy }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async e => {
    e.stopPropagation(); // Prevent expanding/collapsing when clicking copy
    const success = await copyToClipboard(textToCopy);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
    }
  };

  return (
    <button
      className={styles.copyButton}
      onClick={handleCopy}
      title="Copy to clipboard"
    >
      {copied ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"
            fill="currentColor"
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
            d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z"
            fill="currentColor"
          />
        </svg>
      )}
    </button>
  );
};

/**
 * Component for running API tests and displaying results
 */
const TestRunner = ({ fileId }) => {
  const [selectedCases, setSelectedCases] = useState([]);
  const [expandedResults, setExpandedResults] = useState({});
  const [selectedTestCaseId, setSelectedTestCaseId] = useState(null);

  const {
    testCases,
    getTestCases,
    runTest,
    testResults,
    isLoading,
    error,
    getTestCaseDetails,
    testCaseDetails,
    clearTestCaseDetails,
  } = useApi();

  // Load test cases when component mounts
  useEffect(() => {
    if (fileId) {
      getTestCases(fileId);
    }

    // Clear test case details when component unmounts
    return () => {
      clearTestCaseDetails();
    };
  }, [fileId, getTestCases, clearTestCaseDetails]);

  // Run test cases
  const handleRunTests = async () => {
    try {
      // Run selected test cases or all if none selected
      const casesToRun = selectedCases.length > 0 ? selectedCases : null;
      await runTest(fileId, casesToRun);
    } catch (err) {
      // Error handling without console logging
    }
  };

  // Toggle test case selection
  const toggleCaseSelection = caseId => {
    if (selectedCases.includes(caseId)) {
      setSelectedCases(prev => prev.filter(id => id !== caseId));
    } else {
      setSelectedCases(prev => [...prev, caseId]);
    }
  };

  // Toggle result expansion
  const toggleResultExpansion = caseId => {
    setExpandedResults(prev => ({
      ...prev,
      [caseId]: !prev[caseId],
    }));

    // Fetch detailed test case information when expanding
    if (!expandedResults[caseId]) {
      setSelectedTestCaseId(caseId);
      getTestCaseDetails(caseId);
    } else {
      setSelectedTestCaseId(null);
      clearTestCaseDetails();
    }
  };

  // Select/deselect all test cases
  const toggleSelectAll = () => {
    if (selectedCases.length === testCases.length) {
      setSelectedCases([]);
    } else {
      setSelectedCases(testCases.map(tc => tc.id));
    }
  };

  // Format JSON for display
  const formatJson = json => {
    try {
      return JSON.stringify(json, null, 2);
    } catch (error) {
      return String(json);
    }
  };

  return (
    <div className={styles.testRunner}>
      <div className={styles.header}>
        <h2>Test Runner</h2>
        <div className={styles.actions}>
          {testCases.length > 0 && (
            <button
              className={styles.selectAllButton}
              onClick={toggleSelectAll}
              type="button"
            >
              {selectedCases.length === testCases.length
                ? 'Deselect All'
                : 'Select All'}
            </button>
          )}
          <button
            className={styles.runButton}
            onClick={handleRunTests}
            disabled={isLoading || testCases.length === 0}
            type="button"
          >
            {isLoading ? 'Running...' : 'Run Tests'}
          </button>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.testCaseList}>
        {testCases.length === 0 ? (
          <div className={styles.emptyState}>No test cases available</div>
        ) : (
          testCases.map(testCase => (
            <div key={testCase.id} className={styles.testCaseItem}>
              <div className={styles.testCaseHeader}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={selectedCases.includes(testCase.id)}
                    onChange={() => toggleCaseSelection(testCase.id)}
                  />
                  <span className={styles.testCaseName}>{testCase.name}</span>
                </label>
              </div>
            </div>
          ))
        )}
      </div>

      {testResults && (
        <div className={styles.resultsSection}>
          <h3>Test Results</h3>
          <div className={styles.resultsList}>
            {testResults.test_cases?.map((result, index) => (
              <div
                key={result.id || index}
                className={`${styles.resultItem} ${result.success ? styles.success : styles.failure}`}
              >
                <div
                  className={styles.resultHeader}
                  onClick={() => toggleResultExpansion(result.id)}
                >
                  <div className={styles.resultName}>
                    <span className={styles.statusDot}></span>
                    <span>{result.name}</span>
                  </div>
                  <div className={styles.resultStatus}>
                    {result.success ? 'PASS' : 'FAIL'}
                  </div>
                </div>

                {expandedResults[result.id] && (
                  <div className={styles.resultDetails}>
                    {/* Detailed Test Case Information Section */}
                    {selectedTestCaseId === result.id && testCaseDetails && (
                      <div className={styles.detailedInfoSection}>
                        <h4>Test Case Details</h4>
                        <div className={styles.detailGrid}>
                          <div className={styles.detailItem}>
                            <span className={styles.detailLabel}>Created:</span>
                            <span className={styles.detailValue}>
                              {new Date(
                                testCaseDetails.created_at
                              ).toLocaleString()}
                            </span>
                          </div>
                          <div className={styles.detailItem}>
                            <span className={styles.detailLabel}>
                              Last Updated:
                            </span>
                            <span className={styles.detailValue}>
                              {new Date(
                                testCaseDetails.updated_at
                              ).toLocaleString()}
                            </span>
                          </div>
                          <div className={styles.detailItem}>
                            <span className={styles.detailLabel}>Status:</span>
                            <span className={styles.detailValue}>
                              {testCaseDetails.status || 'N/A'}
                            </span>
                          </div>
                          <div className={styles.detailItem}>
                            <span className={styles.detailLabel}>Type:</span>
                            <span className={styles.detailValue}>
                              {testCaseDetails.type || 'N/A'}
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
                                  {testCaseDetails.execution_history.map(
                                    (history, idx) => (
                                      <tr key={idx}>
                                        <td>
                                          {new Date(
                                            history.execution_time
                                          ).toLocaleString()}
                                        </td>
                                        <td
                                          className={
                                            history.success
                                              ? styles.success
                                              : styles.failure
                                          }
                                        >
                                          {history.success ? 'PASS' : 'FAIL'}
                                        </td>
                                        <td>{history.duration || 'N/A'}</td>
                                      </tr>
                                    )
                                  )}
                                </tbody>
                              </table>
                            </div>
                          )}

                        {testCaseDetails.metadata && (
                          <div className={styles.metadataSection}>
                            <h5>Metadata:</h5>
                            <div style={{ position: 'relative' }}>
                              <CopyButton
                                textToCopy={formatJson(
                                  testCaseDetails.metadata
                                )}
                              />
                              <pre
                                className={`${styles.jsonResponse} scrollable`}
                              >
                                {formatJson(testCaseDetails.metadata)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {result.response && (
                      <div className={styles.responseSection}>
                        <h4>Response</h4>
                        <div className={styles.statusCode}>
                          Status: {result.response.status_code}
                        </div>
                        <div style={{ position: 'relative' }}>
                          <CopyButton
                            textToCopy={formatJson(result.response.data)}
                          />
                          <pre className={`${styles.jsonResponse} scrollable`}>
                            {formatJson(result.response.data)}
                          </pre>
                        </div>
                      </div>
                    )}

                    {result.error && (
                      <div className={styles.errorSection}>
                        <h4>Error</h4>
                        <div className={styles.errorMessage}>
                          {result.error}
                        </div>
                      </div>
                    )}

                    {result.diff && (
                      <div className={styles.diffSection}>
                        <h4>Differences</h4>
                        <div style={{ position: 'relative' }}>
                          <CopyButton textToCopy={formatJson(result.diff)} />
                          <pre className={`${styles.diffContent} scrollable`}>
                            {formatJson(result.diff)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TestRunner;
