import { useState } from 'react';
import DiffView from './DiffView';
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
  // Hooks must run before any early return (Rules of Hooks) — a hook after the
  // `!testResult` guard changes hook order across renders and crashes the grid.
  const [editableData, setEditableData] = useState({
    request: pretty(testResult?.request || testResult?.requestData || {}),
    expected: pretty(testResult?.expected || testResult?.expectedData || {}),
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  if (!testResult) {
    return (
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.titleSection}>
            <h3 className={styles.title}>Invalid Test Result</h3>
          </div>
        </div>
      </div>
    );
  }

  const handleOpenDetailView = () => {
    onFocus?.(testResult);
  };

  const handleJsonChange = (field, value) => {
    setEditableData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      const requestData = JSON.parse(editableData.request);
      const expectedData = editableData.expected ? JSON.parse(editableData.expected) : null;
      if (onSave) {
        await onSave(testResult.case_id || testResult.id, { request: requestData, expected: expectedData });
      }
      setHasChanges(false);
    } catch {
      alert('Invalid JSON format. Please check your syntax.');
    }
  };

  const isSuccess =
    Boolean(
      testResult.success === true ||
      testResult.status === 'passed' ||
      testResult.ok === true ||
      testResult.passed === true
    ) && Boolean(testResult.request || testResult.requestData);

  const statusCode = testResult.status_code || testResult.statusCode;
  const duration = testResult.duration_ms || testResult.duration || 0;
  const failures = testResult.failures || testResult.errors || [];
  const failureList = Array.isArray(failures) ? failures : Object.values(failures || {});

  // Pass/fail summary from bulk result shape (passed/total)
  const hasSummary = testResult.passed !== undefined && testResult.total_cases !== undefined;

  return (
    <div className={styles.card}>
      {/* Pass/fail summary bar */}
      {hasSummary && (
        <div className={styles.summaryBar}>
          <div
            className={styles.summaryFill}
            style={{
              width: testResult.total_cases > 0
                ? `${(testResult.passed / testResult.total_cases) * 100}%`
                : '0%',
              background: testResult.failed === 0 ? 'var(--success)' : testResult.passed > 0 ? 'var(--warning)' : 'var(--error)',
            }}
          />
          <span className={styles.summaryLabel}>
            {testResult.passed}/{testResult.total_cases} passed
            {testResult.duration_ms ? ` · ${testResult.duration_ms}ms` : ''}
          </span>
        </div>
      )}

      <div className={styles.header} onClick={handleOpenDetailView}>
        <div className={styles.titleSection}>
          <h3 className={styles.title}>
            {testResult.name || testResult.case || `Test Case ${testResult.case_id || testResult.id}`}
            <span className={`${styles.status} ${isSuccess ? styles.pass : styles.fail}`}>
              {isSuccess ? 'PASS' : 'FAIL'}
            </span>
          </h3>
          <div className={styles.meta}>
            <span className={isSuccess ? styles.statusOk : styles.statusBad}>{statusCode}</span>
            <span className={styles.metaDot}>·</span>
            {Math.round(duration)} ms
          </div>
        </div>
        <div className={styles.actions}>
          {!isSuccess && (
            <button
              type="button"
              className={styles.diffBtn}
              onClick={e => { e.stopPropagation(); setShowDiff(v => !v); }}
              title="Show diff"
            >
              {showDiff ? 'Hide diff' : 'Diff'}
            </button>
          )}
          <button
            type="button"
            className={styles.viewBtn}
            onClick={e => { e.stopPropagation(); handleOpenDetailView(); }}
            title="View details"
          >
            👁 View
          </button>
        </div>
      </div>

      {/* Failures */}
      {!isSuccess && failureList.length > 0 && (
        <div className={styles.failures}>
          {failureList.map((f, i) => (
            <div key={i} className={styles.failureItem}>{f}</div>
          ))}
        </div>
      )}

      {/* Diff view */}
      {showDiff && !isSuccess && (
        <div className={styles.diffSection}>
          <DiffView
            expected={testResult.expected || testResult.expectedData || {}}
            actual={testResult.response || testResult.responseData || {}}
          />
        </div>
      )}
    </div>
  );
}
