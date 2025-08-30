import { useState } from 'react';
import { JsonEditor } from '../common';
import styles from './TestResultCard.module.css';

function pretty(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

export default function TestResultCard({ testResult, onFocus, onSave }) {
  const [editableData, setEditableData] = useState({
    request: pretty(testResult.request || testResult.requestData || {}),
    expected: pretty(testResult.expected || testResult.expectedData || {}),
  });
  const [hasChanges, setHasChanges] = useState(false);

  const handleJsonChange = (field, value) => {
    setEditableData(prev => ({
      ...prev,
      [field]: value,
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      // Parse the JSON to validate it
      const requestData = JSON.parse(editableData.request);
      const expectedData = editableData.expected
        ? JSON.parse(editableData.expected)
        : null;

      // Call the save function passed from parent
      if (onSave) {
        await onSave(testResult.case_id || testResult.id, {
          request: requestData,
          expected: expectedData,
        });
      }

      setHasChanges(false);
    } catch (error) {
      alert('Invalid JSON format. Please check your syntax.');
    }
  };

  const isSuccess =
    testResult.status === 'passed' || testResult.success || testResult.ok;

  // Debug logging to help identify the issue
  if (testResult.case === 'Test case - 2') {
    console.log('Debug - TestResult:', {
      status: testResult.status,
      success: testResult.success,
      ok: testResult.ok,
      isSuccess: isSuccess,
      fullTestResult: testResult,
    });
  }

  const statusCode = testResult.status_code || testResult.statusCode;
  const duration = testResult.duration_ms || testResult.duration || 0;

  return (
    <div className={`${styles.card} ${styles.expanded}`}>
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <h3 className={styles.title}>
            {testResult.name ||
              testResult.case ||
              `Test Case ${testResult.case_id || testResult.id}`}
            <span
              className={`${styles.status} ${isSuccess ? styles.pass : styles.fail}`}
            >
              {isSuccess ? 'PASS' : 'FAIL'}
            </span>
          </h3>
          <div className={styles.meta}>
            status:{' '}
            <span className={isSuccess ? styles.statusOk : styles.statusBad}>
              {statusCode}
            </span>
            &nbsp;·&nbsp; duration: {duration} ms
          </div>
        </div>
        <div className={styles.actions}>
          {hasChanges && (
            <button
              type="button"
              className={styles.saveBtn}
              onClick={handleSave}
            >
              Save
            </button>
          )}
          <button
            type="button"
            className={styles.focusBtn}
            onClick={() => onFocus?.(testResult)}
          >
            Focus
          </button>
        </div>
      </div>

      {/* Always show the 4-section grid view */}
      <div className={styles.expandedView}>
        <div className={styles.gridContainer}>
          {/* Request Section (1,1) */}
          <div className={styles.gridSection}>
            <div className={styles.sectionHeader}>
              <h4>Request Body</h4>
            </div>
            <div className={styles.editorContainer}>
              <JsonEditor
                value={editableData.request}
                onChange={value => handleJsonChange('request', value)}
                language="json"
                showCopyButton={true}
                resizable={true}
                minHeight={200}
                maxHeight={600}
              />
            </div>
          </div>

          {/* Failures Section (1,2) */}
          <div className={styles.gridSection}>
            <div className={styles.sectionHeader}>
              <h4>Failures</h4>
            </div>
            <div className={styles.failuresContainer}>
              {testResult.failures && testResult.failures.length > 0 ? (
                <div className={styles.failuresList}>
                  {testResult.failures.map((failure, index) => (
                    <div key={index} className={styles.failureItem}>
                      {failure}
                    </div>
                  ))}
                </div>
              ) : testResult.error ? (
                <div className={styles.failureItem}>{testResult.error}</div>
              ) : (
                <div className={styles.noFailures}>No failures</div>
              )}
            </div>
          </div>

          {/* Expected Section (2,1) */}
          <div className={styles.gridSection}>
            <div className={styles.sectionHeader}>
              <h4>Expected</h4>
            </div>
            <div className={styles.editorContainer}>
              <JsonEditor
                value={editableData.expected}
                onChange={value => handleJsonChange('expected', value)}
                language="json"
                showCopyButton={true}
                resizable={true}
                minHeight={200}
                maxHeight={600}
              />
            </div>
          </div>

          {/* Response Section (2,2) */}
          <div className={styles.gridSection}>
            <div className={styles.sectionHeader}>
              <h4>Response</h4>
            </div>
            <div className={styles.editorContainer}>
              <JsonEditor
                value={pretty(
                  testResult.response || testResult.responseData || {}
                )}
                language="json"
                showCopyButton={true}
                resizable={true}
                minHeight={200}
                maxHeight={600}
                disabled={true}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
