import { useState } from 'react';
import TestResultCard from '../TestResultCard';
import TestResultFocusModal from '../TestResultFocusModal';
import styles from './TestResultsGrid.module.css';

export default function TestResultsGrid({
  testResults = [],
  title = 'Test Results',
  loading = false,
  error = null,
  onSaveTestCase = null,
}) {
  const [focusedResult, setFocusedResult] = useState(null);

  if (loading) {
    return (
      <div className={styles.container}>
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <span>Running tests...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.error}>
          <div className={styles.errorIcon}>⚠️</div>
          <div>
            <div className={styles.errorTitle}>Test Execution Failed</div>
            <div className={styles.errorMessage}>{error}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!testResults || testResults.length === 0) {
    return (
      <div className={styles.container}>
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🧪</div>
          <div className={styles.emptyTitle}>No Test Results</div>
          <div className={styles.emptyMessage}>
            Run some tests to see results here.
          </div>
        </div>
      </div>
    );
  }

  const passedCount = testResults.filter(
    result => result.status === 'passed' || result.success
  ).length;
  const totalCount = testResults.length;
  const passRate =
    totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.summary}>
          <span className={styles.summaryItem}>
            Total: <strong>{totalCount}</strong>
          </span>
          <span className={styles.summaryItem}>
            Passed: <strong className={styles.passed}>{passedCount}</strong>
          </span>
          <span className={styles.summaryItem}>
            Failed:{' '}
            <strong className={styles.failed}>
              {totalCount - passedCount}
            </strong>
          </span>
          <span className={styles.summaryItem}>
            Pass Rate:{' '}
            <strong className={passRate >= 80 ? styles.passed : styles.failed}>
              {passRate}%
            </strong>
          </span>
        </div>
      </div>

      <div className={styles.grid}>
        {testResults.map((result, index) => (
          <TestResultCard
            key={result.id || result.case_id || index}
            testResult={result}
            onFocus={setFocusedResult}
            onSave={onSaveTestCase}
          />
        ))}
      </div>

      <TestResultFocusModal
        testResult={focusedResult}
        isOpen={!!focusedResult}
        onClose={() => setFocusedResult(null)}
      />
    </div>
  );
}
