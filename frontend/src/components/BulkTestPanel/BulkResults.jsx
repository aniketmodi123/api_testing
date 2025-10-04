import { useState } from 'react';
import TestResultCard from '../TestResultCard';
import TestResultFocusModal from '../TestResultFocusModal';
import styles from './BulkTestPanel.module.css';

export default function BulkResults({ results, isRunning }) {
  const [focusedResult, setFocusedResult] = useState(null);

  if (isRunning) {
    return (
      <div className={styles.resultsSection}>
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <span>Running bulk tests...</span>
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <div className={styles.resultsSection}>
        <div className={styles.noResults}>
          No test results yet. Run bulk tests to see results here.
        </div>
      </div>
    );
  }

  const { summary, details } = results;

  return (
    <div className={styles.resultsSection}>
      {/* Summary */}
      <div className={styles.summary}>
        <div className={`${styles.summaryItem} ${styles.total}`}>
          <div className={styles.summaryValue}>{summary.total}</div>
          <div className={styles.summaryLabel}>Total</div>
        </div>
        <div className={`${styles.summaryItem} ${styles.passed}`}>
          <div className={styles.summaryValue}>{summary.passed}</div>
          <div className={styles.summaryLabel}>Passed</div>
        </div>
        <div className={`${styles.summaryItem} ${styles.failed}`}>
          <div className={styles.summaryValue}>{summary.failed}</div>
          <div className={styles.summaryLabel}>Failed</div>
        </div>
        <div className={`${styles.summaryItem} ${styles.passRate}`}>
          <div className={styles.summaryValue}>{summary.pass_rate}%</div>
          <div className={styles.summaryLabel}>Pass Rate</div>
        </div>
        {summary.duration && (
          <div className={styles.summaryItem}>
            <div className={styles.summaryValue}>{summary.duration}</div>
            <div className={styles.summaryLabel}>Duration</div>
          </div>
        )}
      </div>

      {/* Test Results using the same design as API test cases */}
      {details && details.length > 0 && (
        <div className={styles.testResultsGrid}>
          {details.map((result, index) => (
            <TestResultCard
              key={result.id || index}
              testResult={{
                id: result.id,
                name: result.name,
                success: result.status === 'passed',
                status: result.status,
                status_code: result.response?.status,
                duration_ms: result.duration
                  ? parseInt(result.duration.replace('ms', ''))
                  : 0,
                duration: result.duration,
                failures: result.failures,
                request: result.request,
                response_data: result.response_data,
                // Add any additional data that might be needed
                case_id: result.id,
                ok: result.status === 'passed',
                passed: result.status === 'passed',
              }}
              onFocus={setFocusedResult}
              onSave={null} // Bulk test results are read-only
              onRunTest={null} // Can't re-run individual bulk test results
            />
          ))}
        </div>
      )}

      {/* Result Focus Modal using the same modal as API test cases */}
      <TestResultFocusModal
        testResult={focusedResult}
        isOpen={!!focusedResult}
        onClose={() => setFocusedResult(null)}
        onRunTest={null} // Can't re-run from bulk results
        onSave={null} // Bulk results are read-only
      />
    </div>
  );
}
