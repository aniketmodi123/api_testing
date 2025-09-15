import styles from './BulkTestPanel.module.css';

export default function BulkResults({ results, isRunning }) {
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

      {/* Details */}
      <div className={styles.resultsDetails}>
        {details &&
          details.map(result => (
            <div key={result.id} className={styles.resultItem}>
              <div className={styles.resultInfo}>
                <span
                  className={`${styles.statusIcon} ${styles[result.status]}`}
                >
                  {result.status === 'passed' ? '✅' : '❌'}
                </span>
                <span className={styles.resultName}>{result.name}</span>
              </div>
              <div className={styles.resultMeta}>
                <span>Status: {result.response?.status || 'N/A'}</span>
                <span>Duration: {result.duration}</span>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
