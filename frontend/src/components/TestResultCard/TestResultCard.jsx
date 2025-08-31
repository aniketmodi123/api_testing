import { useState } from 'react';
import styles from './TestResultCard.module.css';

function pretty(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

export default function TestResultCard({
  testResult,
  onFocus,
  onSave,
  onRunTest,
}) {
  const [editableData, setEditableData] = useState({
    request: pretty(testResult.request || testResult.requestData || {}),
    expected: pretty(testResult.expected || testResult.expectedData || {}),
  });
  const [hasChanges, setHasChanges] = useState(false);

  const handleOpenDetailView = () => {
    onFocus?.(testResult);
  };

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

  // Primary status detection: success: true means test passed
  const isSuccess = Boolean(
    testResult.success === true ||
      testResult.status === 'passed' ||
      testResult.ok === true ||
      testResult.passed === true
  );

  const statusCode = testResult.status_code || testResult.statusCode;
  const duration = testResult.duration_ms || testResult.duration || 0;

  return (
    <div className={styles.card}>
      <div className={styles.header} onClick={handleOpenDetailView}>
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
          <button
            type="button"
            className={styles.viewBtn}
            onClick={e => {
              e.stopPropagation();
              handleOpenDetailView();
            }}
            title="View details"
          >
            👁 View
          </button>
        </div>
      </div>
    </div>
  );
}
