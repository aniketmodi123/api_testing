import { useEffect, useState } from 'react';
import { JsonEditor } from '../common';
import styles from './TestResultFocusModal.module.css';

function pretty(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

export default function TestResultFocusModal({
  testResult,
  isOpen,
  onClose,
  onRunTest,
  onSave,
}) {
  const [editableRequest, setEditableRequest] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [currentResult, setCurrentResult] = useState(testResult || null);

  // Initialize editable request when modal opens
  useEffect(() => {
    if (isOpen && testResult) {
      setCurrentResult(testResult);
      setEditableRequest(
        pretty(testResult.request || testResult.requestData || {})
      );
      setIsEditing(false);
    }
  }, [isOpen, testResult]);

  const handleClose = () => {
    setIsEditing(false);
    setEditableRequest('');
    onClose && onClose();
  };

  if (!isOpen || !testResult) return null;

  const displayResult = currentResult || testResult;

  // Primary status detection: success: true means test passed
  const isSuccess = Boolean(
    displayResult.success === true ||
      displayResult.status === 'passed' ||
      displayResult.ok === true ||
      displayResult.passed === true
  );
  const statusCode = displayResult.status_code || displayResult.statusCode;
  const duration = displayResult.duration_ms || displayResult.duration || 0;

  return (
    <>
      <div
        className={`${styles.backdrop} ${isOpen ? styles.open : ''}`}
        onClick={handleClose}
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}
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
              {displayResult.name ||
                displayResult.case ||
                `Test Case ${displayResult.case_id || displayResult.id}`}
              {displayResult.api?.signature &&
                ` — ${displayResult.api.signature}`}
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
            <button
              className={styles.runBtn}
              onClick={() => {
                // Ensure we pass a concrete case id so the handler runs a single test
                const testCaseId =
                  testResult.id ??
                  testResult.case_id ??
                  testResult.caseId ??
                  testResult._id ??
                  null;

                if (isEditing) {
                  try {
                    const parsedRequest = JSON.parse(editableRequest);
                    const callObj = {
                      ...displayResult,
                      request: parsedRequest,
                      id: testCaseId ?? displayResult.id,
                      case_id: testCaseId ?? displayResult.case_id,
                    };
                    onRunTest?.(callObj);
                  } catch (error) {
                    alert('Invalid JSON format. Please check your syntax.');
                    return;
                  }
                } else {
                  const callObj = {
                    ...displayResult,
                    id: testCaseId ?? displayResult.id,
                    case_id: testCaseId ?? displayResult.case_id,
                  };
                  onRunTest?.(callObj);
                }
              }}
            >
              ▶ Run Test
            </button>
            <button
              className={styles.editBtn}
              onClick={async () => {
                if (!isEditing) {
                  setEditableRequest(
                    pretty(testResult.request || testResult.requestData || {})
                  );
                  setIsEditing(true);
                  return;
                }

                // Save logic: parse editor and build payload matching ApiCaseCreateRequest
                try {
                  let parsedRequest = JSON.parse(editableRequest);

                  // Normalize parsedRequest to an object shape
                  if (
                    typeof parsedRequest !== 'object' ||
                    parsedRequest === null
                  ) {
                    parsedRequest = { body: parsedRequest };
                  }

                  // Name: prefer explicit testResult.name, then parsed name, else timestamped default
                  let safeName =
                    testResult.name ||
                    parsedRequest.name ||
                    `Test case - ${new Date().toLocaleTimeString()}`;
                  if (typeof safeName !== 'string')
                    safeName = String(safeName || '');
                  safeName = safeName.trim();
                  if (!safeName)
                    safeName = `Test case - ${new Date().toLocaleTimeString()}`;

                  // Headers and params must be objects
                  let headersObj =
                    parsedRequest.headers ??
                    (parsedRequest.request && parsedRequest.request.headers) ??
                    testResult.headers ??
                    {};
                  if (
                    typeof headersObj !== 'object' ||
                    Array.isArray(headersObj) ||
                    headersObj === null
                  )
                    headersObj = {};

                  let paramsObj =
                    parsedRequest.params ??
                    (parsedRequest.request && parsedRequest.request.params) ??
                    testResult.params ??
                    {};
                  if (
                    typeof paramsObj !== 'object' ||
                    Array.isArray(paramsObj) ||
                    paramsObj === null
                  )
                    paramsObj = {};

                  // Body: prefer parsedRequest.body, then parsedRequest (if it's a non-empty object), then testResult.body
                  let bodyObj = null;
                  if (parsedRequest.body !== undefined) {
                    if (
                      typeof parsedRequest.body === 'object' &&
                      parsedRequest.body !== null
                    ) {
                      bodyObj = parsedRequest.body;
                    } else if (
                      typeof parsedRequest.body === 'string' &&
                      parsedRequest.body.trim().startsWith('{')
                    ) {
                      try {
                        bodyObj = JSON.parse(parsedRequest.body);
                      } catch (e) {
                        // leave as null; backend will validate
                        bodyObj = null;
                      }
                    } else {
                      // primitive body values are not acceptable for expected dict body; send null
                      bodyObj = null;
                    }
                  } else if (
                    typeof parsedRequest === 'object' &&
                    !Array.isArray(parsedRequest) &&
                    Object.keys(parsedRequest).length > 0
                  ) {
                    // If parsedRequest looks like a body object itself, use it
                    bodyObj = parsedRequest;
                  } else if (testResult.body) {
                    bodyObj = testResult.body;
                  } else {
                    bodyObj = null;
                  }

                  // Expected: should be an object or null; try to parse if string
                  let expectedObj =
                    parsedRequest.expected ??
                    testResult.expected ??
                    testResult.expectedData ??
                    null;
                  if (
                    typeof expectedObj === 'string' &&
                    expectedObj.trim().startsWith('{')
                  ) {
                    try {
                      expectedObj = JSON.parse(expectedObj);
                    } catch (e) {
                      expectedObj = null;
                    }
                  }
                  if (
                    typeof expectedObj !== 'object' ||
                    Array.isArray(expectedObj) ||
                    expectedObj === null
                  ) {
                    // keep null if not an object
                    expectedObj =
                      expectedObj && typeof expectedObj === 'object'
                        ? expectedObj
                        : null;
                  }

                  const payload = {
                    name: safeName,
                    headers: headersObj,
                    params: paramsObj,
                    body: bodyObj,
                    expected: expectedObj,
                  };

                  if (onSave) {
                    const fileId =
                      testResult.file_id || testResult.fileId || null;
                    const caseId = testResult.id || testResult.case_id || null;

                    // Debug info
                    try {
                      console.debug('FocusModal saving test case', {
                        fileId,
                        caseId,
                        payload,
                        onSaveArity:
                          typeof onSave === 'function' ? onSave.length : null,
                      });
                    } catch (e) {
                      // ignore logging errors
                    }

                    // Detect expected arity: many existing handlers use (caseId, data)
                    // while the store API uses (fileId, data, caseId).
                    // Build two shaped payloads: one for store-style (file-first)
                    // and one for card/handler-style (case-first expects { request, expected }).
                    const payloadForStore = payload;
                    const updatedDataForCaseHandler = {
                      request: {
                        headers:
                          parsedRequest.headers ??
                          payloadForStore.headers ??
                          {},
                        params:
                          parsedRequest.params ?? payloadForStore.params ?? {},
                        body:
                          parsedRequest.body !== undefined
                            ? parsedRequest.body
                            : (payloadForStore.body ?? null),
                      },
                      expected: payloadForStore.expected ?? null,
                      name: payloadForStore.name,
                    };

                    // Prefer the store-style signature (fileId, data, caseId) when we
                    // have a fileId so the backend receives the correct ?case_id= query param.
                    if (typeof onSave === 'function') {
                      try {
                        console.debug('FocusModal calling onSave', {
                          fileId,
                          caseId,
                          payloadForStore,
                          updatedDataForCaseHandler,
                        });
                      } catch (e) {
                        // ignore logging errors
                      }

                      if (fileId) {
                        // Call file-first signature used by the store/service layer
                        await onSave(fileId, payloadForStore, caseId);
                      } else if (caseId) {
                        // Fallback to case-first handler if fileId not available
                        await onSave(caseId, updatedDataForCaseHandler);
                      } else {
                        // Last resort: single-arg handler
                        await onSave(payloadForStore);
                      }
                    }
                  }

                  setIsEditing(false);
                } catch (error) {
                  alert('Invalid JSON format. Please check your syntax.');
                }
              }}
            >
              {isEditing ? '💾 Save' : '✏️ Edit'}
            </button>
            <button className={styles.closeBtn} onClick={handleClose}>
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
            <div className={styles.sectionTitle}>
              Request{' '}
              {isEditing && (
                <span className={styles.editIndicator}>(Editing)</span>
              )}
            </div>
            {isEditing ? (
              <JsonEditor
                value={editableRequest}
                onChange={setEditableRequest}
                placeholder="Enter JSON request data..."
                minHeight={300}
                maxHeight={600}
                resizable={true}
                language="json"
              />
            ) : (
              <pre className={styles.json}>
                {pretty(testResult.request || testResult.requestData)}
              </pre>
            )}
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
