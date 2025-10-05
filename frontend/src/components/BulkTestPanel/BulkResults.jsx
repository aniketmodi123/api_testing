import { useEffect, useState } from 'react';
import DeleteIcon from '../../assets/images/delete.svg';
import { apiService } from '../../services/apiService.js';
import { useAuth } from '../../store/session.jsx';
import TestResultCard from '../TestResultCard';
import TestResultFocusModal from '../TestResultFocusModal';
import styles from './BulkTestPanel.module.css';

export default function BulkResults({ results, isRunning }) {
  // Always declare all hooks first - no conditional returns before hooks
  const [focusedResult, setFocusedResult] = useState(null);
  const [expandedExecutions, setExpandedExecutions] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedExecutionPages, setExpandedExecutionPages] = useState({});
  const [deletingIds, setDeletingIds] = useState(new Set());
  const auth = useAuth();
  const [localExecutions, setLocalExecutions] = useState([]);

  const EXECUTIONS_PER_PAGE = 10;
  const RESULTS_PER_PAGE = 10;

  // Keep local executions in sync with incoming props
  useEffect(() => {
    if (results?.executions) {
      setLocalExecutions(results.executions);
    } else {
      setLocalExecutions([]);
    }
  }, [results]);

  // Early returns after all hooks are declared
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

  // Handle new execution list format
  if (results.executions) {
    const executions = localExecutions;

    // Pagination for executions
    const totalPages = Math.ceil(executions.length / EXECUTIONS_PER_PAGE);
    const startIndex = (currentPage - 1) * EXECUTIONS_PER_PAGE;
    const endIndex = startIndex + EXECUTIONS_PER_PAGE;
    const currentExecutions = executions.slice(startIndex, endIndex);

    const toggleExecutionExpansion = executionId => {
      setExpandedExecutions(prev => {
        const newSet = new Set(prev);
        if (newSet.has(executionId)) {
          newSet.delete(executionId);
          // Reset pagination for this execution when collapsed
          setExpandedExecutionPages(prevPages => {
            const newPages = { ...prevPages };
            delete newPages[executionId];
            return newPages;
          });
        } else {
          newSet.add(executionId);
          // Initialize pagination for this execution
          setExpandedExecutionPages(prev => ({
            ...prev,
            [executionId]: 1,
          }));
        }
        return newSet;
      });
    };

    const getExecutionResults = (execution, page = 1) => {
      if (!execution.results || execution.results.length === 0) return [];

      const startIdx = (page - 1) * RESULTS_PER_PAGE;
      const endIdx = startIdx + RESULTS_PER_PAGE;
      return execution.results.slice(startIdx, endIdx);
    };

    const getExecutionResultsPageCount = execution => {
      if (!execution.results || execution.results.length === 0) return 0;
      return Math.ceil(execution.results.length / RESULTS_PER_PAGE);
    };

    const formatDateTime = dateTimeStr => {
      if (!dateTimeStr) return 'N/A';
      return new Date(dateTimeStr).toLocaleString();
    };

    const getStatusBadge = status => {
      const statusClass = status?.toLowerCase() || 'unknown';
      return (
        <span className={`${styles.statusBadge} ${styles[statusClass]}`}>
          {status?.toUpperCase() || 'UNKNOWN'}
        </span>
      );
    };

    const getExecutionSummary = execution => {
      const total = execution.total_cases || 0;
      const passed = execution.passed || 0;
      const failed = execution.failed || 0;
      const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

      return { total, passed, failed, passRate };
    };

    return (
      <div className={styles.resultsSection}>
        <div className={styles.executionListHeader}>
          <h3>Test Executions ({executions.length} total)</h3>
          <p className={styles.executionSubtitle}>
            Click on any execution to view detailed test results
          </p>
        </div>

        <div className={styles.executionsList}>
          {currentExecutions.map(execution => {
            const isExpanded = expandedExecutions.has(execution.id);
            const summary = getExecutionSummary(execution);
            const currentResultPage = expandedExecutionPages[execution.id] || 1;
            const paginatedResults = getExecutionResults(
              execution,
              currentResultPage
            );
            const totalResultPages = getExecutionResultsPageCount(execution);

            return (
              <div key={execution.id} className={styles.executionItem}>
                {/* Execution Header - Always Visible */}
                <div
                  className={styles.executionHeader}
                  onClick={() => toggleExecutionExpansion(execution.id)}
                >
                  <div className={styles.executionHeaderLeft}>
                    <div className={styles.executionMeta}>
                      <span className={styles.executionId}>
                        #{execution.id}
                      </span>
                      {getStatusBadge(execution.status)}
                      <span className={styles.executionTime}>
                        {formatDateTime(execution.started_at)}
                      </span>
                    </div>
                    <div className={styles.executionSummary}>
                      <span className={styles.summaryItem}>
                        {summary.total} Total
                      </span>
                      <span
                        className={`${styles.summaryItem} ${styles.passed}`}
                      >
                        {summary.passed} Passed
                      </span>
                      <span
                        className={`${styles.summaryItem} ${styles.failed}`}
                      >
                        {summary.failed} Failed
                      </span>
                      <span className={styles.summaryItem}>
                        {summary.passRate}% Pass Rate
                      </span>
                    </div>
                  </div>
                  <div className={styles.executionHeaderRight}>
                    {/* Delete execution button */}
                    <button
                      title="Delete execution"
                      className={styles.deleteButton}
                      onClick={e => {
                        e.stopPropagation();
                        if (
                          execution.status === 'running' ||
                          execution.status === 'queued'
                        ) {
                          return; // Do not allow delete
                        }
                        if (
                          !confirm(
                            `Delete execution #${execution.id}? This will remove all its results.`
                          )
                        )
                          return;

                        // Call API and optimistically remove on success
                        setDeletingIds(prev => new Set(prev).add(execution.id));
                        apiService
                          .deleteBulkTestExecution(
                            execution.schedule_id,
                            execution.id,
                            auth?.username
                          )
                          .then(() => {
                            // Remove the execution from local state
                            setLocalExecutions(prev =>
                              prev.filter(ex => ex.id !== execution.id)
                            );
                            // Collapse and clear pagination state for it
                            setExpandedExecutions(prev => {
                              const ns = new Set(prev);
                              ns.delete(execution.id);
                              return ns;
                            });
                            setExpandedExecutionPages(prev => {
                              const np = { ...prev };
                              delete np[execution.id];
                              return np;
                            });
                            // If current page is now out of range, move back one page
                            const total = executions.length - 1;
                            const newTotalPages = Math.max(
                              1,
                              Math.ceil(total / EXECUTIONS_PER_PAGE)
                            );
                            setCurrentPage(prev =>
                              Math.min(prev, newTotalPages)
                            );
                          })
                          .catch(err => {
                            alert(
                              err?.response?.data?.error_message ||
                                'Failed to delete execution'
                            );
                          })
                          .finally(() => {
                            setDeletingIds(prev => {
                              const ns = new Set(prev);
                              ns.delete(execution.id);
                              return ns;
                            });
                          });
                      }}
                      disabled={
                        deletingIds.has(execution.id) ||
                        execution.status === 'running' ||
                        execution.status === 'queued'
                      }
                    >
                      <img
                        src={DeleteIcon}
                        alt="Delete"
                        width="16"
                        height="16"
                      />
                    </button>
                    <span className={styles.expandIcon}>
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  </div>
                </div>

                {/* Error Message */}
                {execution.error_message && (
                  <div className={styles.executionError}>
                    <strong>Error:</strong> {execution.error_message}
                  </div>
                )}

                {/* Expanded Content - Test Results */}
                {isExpanded && (
                  <div className={styles.executionContent}>
                    {execution.results && execution.results.length > 0 ? (
                      <>
                        <div className={styles.resultsGrid}>
                          {paginatedResults.map(result => (
                            <TestResultCard
                              key={result.id}
                              testResult={{
                                id: result.id,
                                case_id: result.case_id,
                                name: result.case_name,
                                status: result.success ? 'passed' : 'failed',
                                success: result.success,
                                status_code: result.status_code,
                                statusCode: result.status_code,
                                duration_ms: result.duration_ms || 0,
                                duration: result.duration_ms
                                  ? `${result.duration_ms}ms`
                                  : 'N/A',
                                failures: result.failures || [],
                                request: result.request || {},
                                requestData: result.request || {},
                                response: result.response || {},
                                response_data: result.response || {},
                                responseData: result.response || {},
                                expected: {}, // Not available in execution results
                                expectedData: {}, // Not available in execution results
                              }}
                              onFocus={result => setFocusedResult(result)}
                            />
                          ))}
                        </div>

                        {/* Results Pagination */}
                        {totalResultPages > 1 && (
                          <div className={styles.resultsPagination}>
                            <span className={styles.paginationInfo}>
                              Showing{' '}
                              {(currentResultPage - 1) * RESULTS_PER_PAGE + 1}-
                              {Math.min(
                                currentResultPage * RESULTS_PER_PAGE,
                                execution.results.length
                              )}{' '}
                              of {execution.results.length} results
                            </span>
                            <div className={styles.paginationControls}>
                              <button
                                onClick={() =>
                                  setExpandedExecutionPages(prev => ({
                                    ...prev,
                                    [execution.id]: Math.max(
                                      1,
                                      currentResultPage - 1
                                    ),
                                  }))
                                }
                                disabled={currentResultPage === 1}
                                className={styles.paginationButton}
                              >
                                Previous
                              </button>
                              <span className={styles.pageInfo}>
                                Page {currentResultPage} of {totalResultPages}
                              </span>
                              <button
                                onClick={() =>
                                  setExpandedExecutionPages(prev => ({
                                    ...prev,
                                    [execution.id]: Math.min(
                                      totalResultPages,
                                      currentResultPage + 1
                                    ),
                                  }))
                                }
                                disabled={
                                  currentResultPage === totalResultPages
                                }
                                className={styles.paginationButton}
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className={styles.noTestResults}>
                        No detailed test results available for this execution.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Executions Pagination */}
        {totalPages > 1 && (
          <div className={styles.mainPagination}>
            <div className={styles.paginationInfo}>
              Showing {startIndex + 1}-{Math.min(endIndex, executions.length)}{' '}
              of {executions.length} executions
            </div>
            <div className={styles.paginationControls}>
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className={styles.paginationButton}
              >
                Previous
              </button>
              <span className={styles.pageInfo}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() =>
                  setCurrentPage(prev => Math.min(totalPages, prev + 1))
                }
                disabled={currentPage === totalPages}
                className={styles.paginationButton}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Modal for viewing detailed results */}
        {focusedResult && (
          <TestResultFocusModal
            result={focusedResult}
            onClose={() => setFocusedResult(null)}
          />
        )}
      </div>
    );
  }

  // Fallback for old format (single execution)
  const { summary, details } = results;

  return (
    <div className={styles.resultsSection}>
      {/* Execution Status */}
      {summary.execution_status && (
        <div className={styles.executionStatus}>
          <div className={styles.statusHeader}>
            <span className={styles.statusLabel}>Execution Status:</span>
            <span
              className={`${styles.statusValue} ${styles[summary.execution_status]}`}
            >
              {summary.execution_status.toUpperCase()}
            </span>
            {summary.started_at && (
              <span className={styles.timestamp}>
                Started: {new Date(summary.started_at).toLocaleString()}
              </span>
            )}
          </div>
          {summary.execution_error && (
            <div className={styles.errorMessage}>
              <strong>Error:</strong> {summary.execution_error}
            </div>
          )}
        </div>
      )}

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
