import styles from './TestResultFocusModal.module.css';

function pretty(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

export default function TestResultFocusModal({ testResult, isOpen, onClose }) {
  if (!isOpen || !testResult) return null;

  const isSuccess = testResult.status === 'passed' || testResult.success;
  const statusCode = testResult.status_code || testResult.statusCode;
  const duration = testResult.duration_ms || testResult.duration || 0;

  return (
    <>
      <div
        className={`${styles.backdrop} ${isOpen ? styles.open : ''}`}
        onClick={onClose}
      />
      <div
        className={`${styles.modal} ${isOpen ? styles.open : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="focus-title"
      >
        <div className={styles.header}>
          <div className={styles.titleSection}>
            <h3 id="focus-title" className={styles.title}>
              {testResult.name ||
                testResult.case ||
                `Test Case ${testResult.case_id || testResult.id}`}
              {testResult.api?.signature && ` — ${testResult.api.signature}`}
            </h3>
            <div className={styles.meta}>
              status:{' '}
              <span className={isSuccess ? styles.statusOk : styles.statusBad}>
                {statusCode}
              </span>
              &nbsp;·&nbsp; duration: {duration} ms &nbsp;·&nbsp;{' '}
              <span
                className={`${styles.status} ${isSuccess ? styles.pass : styles.fail}`}
              >
                {isSuccess ? 'PASS' : 'FAIL'}
              </span>
            </div>
          </div>
          <div className={styles.actions}>
            <button className={styles.closeBtn} onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {((testResult.failures && testResult.failures.length > 0) ||
          testResult.error) && (
          <div className={styles.failures}>
            {testResult.failures
              ? `• ${testResult.failures.join('\n• ')}`
              : testResult.error}
          </div>
        )}

        <div className={styles.content}>
          <div className={styles.column}>
            <div className={styles.sectionTitle}>Request</div>
            <pre className={styles.json}>
              {pretty(testResult.request || testResult.requestData)}
            </pre>
          </div>
          <div className={styles.column}>
            <div className={styles.sectionTitle}>Response</div>
            <pre className={styles.json}>
              {pretty(testResult.response || testResult.responseData)}
            </pre>
          </div>
        </div>

        {(testResult.expected || testResult.expectedData) && (
          <div className={styles.expectedSection}>
            <div className={styles.sectionTitle}>Expected</div>
            <pre className={styles.json}>
              {pretty(testResult.expected || testResult.expectedData)}
            </pre>
          </div>
        )}
      </div>
    </>
  );
}
