import { useState } from 'react';
import { useApi } from '../../store/api';
import styles from './TestRunner.module.css';

/**
 * Component for running API tests and displaying results
 */
const TestRunner = ({ fileId }) => {
  const [selectedCases, setSelectedCases] = useState([]);
  const [expandedResults, setExpandedResults] = useState({});

  const { testCases, getTestCases, runTest, testResults, isLoading, error } =
    useApi();

  // Run test cases
  const handleRunTests = async () => {
    try {
      // Run selected test cases or all if none selected
      const casesToRun = selectedCases.length > 0 ? selectedCases : null;
      await runTest(fileId, casesToRun);
    } catch (err) {
      console.error('Error running tests:', err);
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
                    {result.response && (
                      <div className={styles.responseSection}>
                        <h4>Response</h4>
                        <div className={styles.statusCode}>
                          Status: {result.response.status_code}
                        </div>
                        <pre className={styles.jsonResponse}>
                          {formatJson(result.response.data)}
                        </pre>
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
                        <pre className={styles.diffContent}>
                          {formatJson(result.diff)}
                        </pre>
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
