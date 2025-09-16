import styles from './BulkTestPanel.module.css';

export default function BulkControls({
  testScope,
  onScopeChange,
  isRunning,
  onRunTests,
  onShowScheduler,
  selectedCount,
}) {
  return (
    <div className={styles.controlsSection}>
      <div className={styles.controlsHeader}>
        <h3>🧪 Bulk Test Controls</h3>
        <div className={styles.selectedInfo}>
          {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
        </div>
      </div>

      <div className={styles.scopeControls}>
        <label htmlFor="testScope">Test Scope:</label>
        <select
          id="testScope"
          value={testScope}
          onChange={e => onScopeChange(e.target.value)}
          disabled={isRunning}
        >
          <option value="selected">Selected Items</option>
          <option value="api">Selected Api</option>
        </select>
      </div>

      <div className={styles.actionButtons}>
        <button
          className={styles.runButton}
          onClick={onRunTests}
          disabled={
            isRunning || (testScope === 'selected' && selectedCount === 0)
          }
        >
          {isRunning ? (
            <>
              <span className={styles.spinner}></span>
              Running...
            </>
          ) : (
            `▶️ Run ${testScope === 'selected' ? 'Selected' : testScope === 'folder' ? 'Folder' : 'All'} Tests`
          )}
        </button>

        <button
          className={styles.scheduleButton}
          onClick={onShowScheduler}
          disabled={
            isRunning || (testScope === 'selected' && selectedCount === 0)
          }
        >
          📅 Schedule Tests
        </button>
      </div>
    </div>
  );
}
