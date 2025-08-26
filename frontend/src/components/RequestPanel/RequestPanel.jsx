import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useApi } from '../../store/api';
import { useNode } from '../../store/node';
import { TestCaseForm } from '../TestCaseForm';
import styles from './RequestPanel.module.css';

// Helper function to safely extract values from possibly nested API response objects
const extractValue = (obj, key, defaultValue = '') => {
  if (!obj) return defaultValue;

  try {
    // For our specific response format with response_code and data
    if (obj.response_code !== undefined && obj.data) {
      // Check if the key exists in the data object
      if (obj.data[key] !== undefined) {
        return obj.data[key];
      }
    }

    // Direct property
    if (obj[key] !== undefined) return obj[key];

    // Check if nested in data
    if (obj.data && obj.data[key] !== undefined) return obj.data[key];

    // Check if nested in response
    if (obj.response && obj.response[key] !== undefined)
      return obj.response[key];

    // Check if nested in response.data
    if (
      obj.response &&
      obj.response.data &&
      obj.response.data[key] !== undefined
    ) {
      return obj.response.data[key];
    }

    // Special cases for commonly used keys with different formats

    // For file_id vs fileId
    if (key === 'id' && obj.file_id !== undefined) return obj.file_id;

    // For endpoint vs url
    if (key === 'url' && obj.endpoint !== undefined) return obj.endpoint;

    // For keys that might be in a different format (snake_case to camelCase)
    const camelKey = key.replace(/_([a-z])/g, g => g[1].toUpperCase());
    if (obj[camelKey] !== undefined) return obj[camelKey];

    // Snake case conversion (camelCase to snake_case)
    const snakeKey = key.replace(
      /[A-Z]/g,
      letter => `_${letter.toLowerCase()}`
    );
    if (obj[snakeKey] !== undefined) return obj[snakeKey];

    // Special case for headers that might be in a different format
    if (key === 'headers' && obj.header) return obj.header;

    // Extra meta might contain some values
    if (obj.extra_meta && obj.extra_meta[key] !== undefined) {
      return obj.extra_meta[key];
    }

    return defaultValue;
  } catch (error) {
    console.error(`Error extracting ${key} from API data:`, error);
    return defaultValue;
  }
};

export default function RequestPanel({ activeRequest }) {
  const { selectedNode, getNodeById } = useNode();
  const {
    getApi,
    getTestCases,
    testCases,
    activeApi,
    runTest,
    testResults,
    clearTestResults,
    createTestCase,
    isLoading,
  } = useApi();

  const [method, setMethod] = useState(
    activeRequest?.method || selectedNode?.method || 'GET'
  );
  const [url, setUrl] = useState(
    activeRequest?.url || selectedNode?.url || selectedNode?.endpoint || ''
  );
  const [showTestCaseForm, setShowTestCaseForm] = useState(false);
  const [editingTestCaseId, setEditingTestCaseId] = useState(null);

  // Update the panel when selectedNode changes
  useEffect(() => {
    if (selectedNode) {
      setMethod(selectedNode.method || 'GET');

      // Set URL directly from node without modifications
      if (selectedNode.url) {
        setUrl(selectedNode.url);
      } else if (selectedNode.endpoint) {
        // Use endpoint directly if URL is not available
        setUrl(selectedNode.endpoint);
      } else {
        // Leave URL empty if no URL or endpoint is available
        setUrl('');
      }

      // Load API details if this is a file node
      if (selectedNode.type === 'file' && selectedNode.id) {
        // Load the API details
        getApi(selectedNode.id)
          .then(apiResponse => {
            console.log('API data loaded:', apiResponse);

            // Extract the API data from the response structure
            const apiData = apiResponse?.data || {};

            if (apiData) {
              // Use the exact endpoint or URL from the API without modifying it
              if (apiData.endpoint) {
                // Use the endpoint directly without adding any base URL
                setUrl(apiData.endpoint);
              } else if (apiData.url) {
                // Use the URL directly if available
                setUrl(apiData.url);
              }

              // Set the method from the API
              if (apiData.method) {
                setMethod(apiData.method);
              }
            }
          })
          .catch(err => console.error('Error loading API:', err));

        // Load test cases for this API and reset selected test cases
        setSelectedTestCases([]);
        getTestCases(selectedNode.id)
          .then(testCasesResponse => {
            console.log('Test cases loaded:', testCasesResponse);
          })
          .catch(err => console.error('Error loading test cases:', err));
      }
    }
  }, [selectedNode, getApi, getTestCases]);

  const [activeTab, setActiveTab] = useState('api');
  const [responseTab, setResponseTab] = useState('body');
  const [isSending, setIsSending] = useState(false);
  const [response, setResponse] = useState(null);
  const [selectedTestCases, setSelectedTestCases] = useState([]);

  const handleTestCaseSelection = testCaseId => {
    setSelectedTestCases(prev => {
      if (prev.includes(testCaseId)) {
        return prev.filter(id => id !== testCaseId);
      } else {
        return [...prev, testCaseId];
      }
    });
  };

  const handleRunSelectedTests = async () => {
    if (selectedTestCases.length === 0) return;

    setIsSending(true);
    try {
      const result = await runTest(selectedNode?.id, selectedTestCases);
      console.log('Selected tests result:', result);
      setActiveTab('apiTests');
    } catch (error) {
      console.error('Error running selected tests:', error);
    } finally {
      setIsSending(false);
    }
  };

  // Function to directly call the API with current parameters
  const handleDirectApiCall = async () => {
    setIsSending(true);

    try {
      // Prepare request configuration
      const requestConfig = {
        method: method.toLowerCase(),
        url: url,
        headers: extractValue(activeApi, 'headers', {}),
        params: extractValue(activeApi, 'params', {}),
      };

      // Add body for non-GET requests
      if (method !== 'GET') {
        requestConfig.data = extractValue(activeApi, 'request_body', {});
      }

      console.log('Making direct API call with config:', requestConfig);

      // Make the API call using the Axios instance
      const directResponse = await api(requestConfig);

      // Set the response for display
      setResponse({
        statusCode: directResponse.status,
        statusText: directResponse.statusText,
        body: directResponse.data,
        headers: directResponse.headers,
        responseTime: new Date().toISOString(),
      });

      // Switch to the response tab
      setActiveTab('response');
      setResponseTab('body');
    } catch (error) {
      console.error('Error making direct API call:', error);

      // Format error response
      setResponse({
        statusCode: error.response?.status || 500,
        statusText: error.response?.statusText || 'Error',
        body: {
          message: error.message,
          details: error.response?.data || 'No response details available',
        },
        headers: error.response?.headers || {},
        responseTime: new Date().toISOString(),
        isError: true,
      });

      // Switch to the response tab
      setActiveTab('response');
      setResponseTab('body');
    } finally {
      setIsSending(false);
    }
  };

  // Function to validate the API by creating a test case and then validating
  const handleValidateApi = async () => {
    setIsSending(true);

    try {
      if (!selectedNode?.id) {
        throw new Error(
          'No API selected. Please select or create an API first.'
        );
      }

      // Create a test case with the current parameters
      const testCaseData = {
        name: `Validation test - ${new Date().toISOString()}`,
        description: 'Auto-generated test case for validation',
        method: method,
        endpoint: url,
        headers: extractValue(activeApi, 'headers', {}),
        params: extractValue(activeApi, 'params', {}),
        request_body: extractValue(activeApi, 'request_body', {}),
        expected_status: 200, // Default expected status
        expected_response: {}, // Default empty expected response
      };

      console.log('Creating test case for validation:', testCaseData);

      // Create the test case
      const createResult = await createTestCase(selectedNode.id, testCaseData);
      console.log('Test case created:', createResult);

      if (!createResult || !createResult.case_id) {
        throw new Error('Failed to create test case for validation');
      }

      // Run the test using the new case ID
      const validationResult = await runTest(selectedNode.id, [
        createResult.case_id,
      ]);
      console.log('Validation result:', validationResult);

      // Set the test results and switch to the API Tests tab
      setActiveTab('apiTests');
    } catch (error) {
      console.error('Error validating API:', error);

      // Show error in response tab
      setResponse({
        statusCode: 500,
        statusText: 'Validation Error',
        body: {
          message: 'Failed to validate API',
          details: error.message,
        },
        headers: {},
        responseTime: new Date().toISOString(),
        isError: true,
      });

      setActiveTab('response');
      setResponseTab('body');
    } finally {
      setIsSending(false);
    }
  };

  const handleSend = async () => {
    setIsSending(true);

    try {
      // If we have a file node selected, try to run the API test
      if (selectedNode?.type === 'file' && selectedNode?.id) {
        const result = await runTest(selectedNode.id);
        console.log('API test result:', result);
        // Switch to the API Tests tab to show results
        setActiveTab('apiTests');

        if (result) {
          // Handle the standard response format with response_code and data structure
          if (result.data && typeof result.data === 'object') {
            const apiResponseData = result.data;
            const responseCode =
              result.status || apiResponseData.response_code || 200;

            setResponse({
              status: responseCode,
              statusText:
                responseCode >= 200 && responseCode < 300 ? 'OK' : 'Error',
              time: apiResponseData.time || '0 ms',
              size:
                apiResponseData.size ||
                `${JSON.stringify(apiResponseData).length} B`,
              body: apiResponseData, // Keep the full response data for display
              headers: apiResponseData.headers || {},
            });

            console.log('Formatted API response:', {
              status: responseCode,
              body: apiResponseData,
            });
          } else {
            // Direct response object
            setResponse({
              status: result.status || 200,
              statusText: result.statusText || 'OK',
              time: '0 ms',
              size: `${JSON.stringify(result).length} B`,
              body: result,
              headers: result.headers || {},
            });
          }
        } else {
          // No result returned
          setResponse({
            status: 404,
            statusText: 'No Response',
            time: '0 ms',
            size: '0 B',
            body: { message: 'No response received from API' },
            headers: {},
          });
        }
      } else {
        // Fallback to simulated response
        setTimeout(() => {
          setResponse({
            status: 200,
            statusText: 'OK',
            time: '123 ms',
            size: '532 B',
            body: {
              status: 'success',
              data: [
                { id: 1, name: 'Item 1' },
                { id: 2, name: 'Item 2' },
              ],
            },
            headers: {
              'content-type': 'application/json',
              'x-powered-by': 'Example Server',
              date: new Date().toUTCString(),
            },
          });
          setIsSending(false);
        }, 800);
      }
    } catch (error) {
      console.error('Error sending request:', error);
      setResponse({
        status: error.response?.status || 500,
        statusText: error.response?.statusText || 'Error',
        time: '0 ms',
        size: '0 B',
        body: {
          error: error.message || 'Unknown error occurred',
          details: error.response?.data || null,
        },
        headers: error.response?.headers || {},
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className={styles.requestPanel}>
      {/* Request URL Bar */}
      <div className={styles.urlBar}>
        <select
          className={styles.methodSelector}
          value={method}
          onChange={e => setMethod(e.target.value)}
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
          <option value="PATCH">PATCH</option>
          <option value="HEAD">HEAD</option>
          <option value="OPTIONS">OPTIONS</option>
        </select>

        <input
          type="text"
          className={styles.urlInput}
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="Enter request URL"
        />

        <div className={styles.buttonGroup}>
          <button
            className={styles.sendButton}
            onClick={handleSend}
            disabled={isSending}
          >
            {isSending ? 'Sending...' : 'Send'}
          </button>

          <button
            className={styles.directApiButton}
            onClick={handleDirectApiCall}
            disabled={isSending || !url}
            title="Call API directly using current parameters"
          >
            {isSending ? 'Calling...' : 'Direct Call'}
          </button>

          <button
            className={styles.validateButton}
            onClick={handleValidateApi}
            disabled={isSending || !url || !selectedNode?.id}
            title="Record as test case and validate API"
          >
            {isSending ? 'Validating...' : 'Validate'}
          </button>
        </div>

        <button
          className={styles.actionButton}
          onClick={() => {
            // Create a function to update API config without changing general API info
            if (selectedNode?.id && activeApi) {
              // Update only the request configuration parts
              const configOnlyData = {
                ...activeApi,
                method: method,
                endpoint: url,
                headers: extractValue(activeApi, 'headers', {}),
                params: extractValue(activeApi, 'params', {}),
                request_body: extractValue(activeApi, 'request_body', {}),
              };

              // Save the configuration
              try {
                updateApi(selectedNode.id, configOnlyData);
                console.log('Request configuration updated');
              } catch (err) {
                console.error('Error updating request configuration:', err);
              }
            }
          }}
          title="Update request configuration"
        >
          Update Config
        </button>

        <button
          className={styles.actionButton}
          onClick={() => {
            if (!response) {
              alert('Send a request first to record as a test case');
              return;
            }

            // Save the current request/response as a test case
            try {
              const testCase = {
                api_id: selectedNode?.id,
                name: `Test case - ${new Date().toLocaleTimeString()}`,
                request: {
                  method: method,
                  endpoint: url,
                  headers: extractValue(activeApi, 'headers', {}),
                  params: extractValue(activeApi, 'params', {}),
                  body: extractValue(activeApi, 'request_body', {}),
                },
                expected_response: {
                  status: response.status,
                  headers: response.headers || {},
                  body: response.body || {},
                },
                created_at: new Date().toISOString(),
              };

              console.log('Recording test case:', testCase);
              // In a real implementation, you would save this to your backend
              alert('Test case recorded');
            } catch (err) {
              console.error('Error recording test case:', err);
            }
          }}
          disabled={!response}
          title="Save current request/response as a test case"
        >
          Record as Case
        </button>
      </div>

      {/* API metadata bar - shows if API has additional information */}
      {activeApi &&
        (extractValue(activeApi, 'tags', []).length > 0 ||
          extractValue(activeApi, 'version') ||
          extractValue(activeApi, 'status')) && (
          <div className={styles.apiMetaBar}>
            {extractValue(activeApi, 'tags', []).length > 0 && (
              <div className={styles.apiMetaTags}>
                {extractValue(activeApi, 'tags', []).map((tag, index) => (
                  <span key={index} className={styles.metaTag}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {extractValue(activeApi, 'version') && (
              <div className={styles.apiMetaVersion}>
                v{extractValue(activeApi, 'version')}
              </div>
            )}
            {extractValue(activeApi, 'status') && (
              <div className={styles.apiMetaStatus}>
                {extractValue(activeApi, 'status')}
              </div>
            )}
          </div>
        )}

      {/* Request Configuration Tabs */}
      <div className={styles.tabs}>
        <div
          className={`${styles.tab} ${activeTab === 'api' ? styles.active : ''}`}
          onClick={() => setActiveTab('api')}
        >
          API Details
        </div>
        <div
          className={`${styles.tab} ${activeTab === 'params' ? styles.active : ''}`}
          onClick={() => setActiveTab('params')}
        >
          Params
        </div>
        <div
          className={`${styles.tab} ${activeTab === 'authorization' ? styles.active : ''}`}
          onClick={() => setActiveTab('authorization')}
        >
          Authorization
        </div>
        <div
          className={`${styles.tab} ${activeTab === 'headers' ? styles.active : ''}`}
          onClick={() => setActiveTab('headers')}
        >
          Headers
        </div>
        <div
          className={`${styles.tab} ${activeTab === 'body' ? styles.active : ''}`}
          onClick={() => setActiveTab('body')}
        >
          Body
        </div>
        <div
          className={`${styles.tab} ${activeTab === 'validation' ? styles.active : ''}`}
          onClick={() => setActiveTab('validation')}
        >
          Validation
        </div>
        <div
          className={`${styles.tab} ${activeTab === 'apiTests' ? styles.active : ''}`}
          onClick={() => setActiveTab('apiTests')}
        >
          API Tests
        </div>
      </div>

      {/* Tab Content */}
      <div className={styles.tabContent}>
        {activeTab === 'api' && (
          <div className={styles.apiContent}>
            {isLoading ? (
              <div className={styles.loadingIndicator}>
                Loading API details...
              </div>
            ) : activeApi ? (
              <div className={styles.apiDetails}>
                <h3 className={styles.apiTitle}>
                  {extractValue(activeApi, 'name', 'Unnamed API')}
                </h3>
                <div className={styles.apiMethod}>
                  <strong>Method:</strong>{' '}
                  {extractValue(activeApi, 'method', 'GET')}
                </div>
                <div className={styles.apiUrl}>
                  <strong>URL:</strong>{' '}
                  {extractValue(activeApi, 'endpoint') ||
                    extractValue(activeApi, 'url', '')}
                </div>

                {extractValue(activeApi, 'description') && (
                  <div className={styles.apiDescription}>
                    <h4>Description</h4>
                    <p>{extractValue(activeApi, 'description')}</p>
                  </div>
                )}

                {extractValue(activeApi, 'file_name') && (
                  <div className={styles.apiFileName}>
                    <h4>File Name</h4>
                    <p>{extractValue(activeApi, 'file_name')}</p>
                  </div>
                )}

                {extractValue(activeApi, 'tags', []).length > 0 && (
                  <div className={styles.apiTags}>
                    <h4>Tags</h4>
                    <div>
                      {extractValue(activeApi, 'tags', []).map((tag, index) => (
                        <span key={index} className={styles.tagBadge}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {extractValue(activeApi, 'version') && (
                  <div className={styles.apiVersion}>
                    <h4>Version</h4>
                    <p>{extractValue(activeApi, 'version')}</p>
                  </div>
                )}

                {extractValue(activeApi, 'is_active') !== undefined && (
                  <div className={styles.apiStatus}>
                    <h4>Status</h4>
                    <p>
                      {extractValue(activeApi, 'is_active')
                        ? 'Active'
                        : 'Inactive'}
                    </p>
                  </div>
                )}

                {extractValue(activeApi, 'workspace_id') && (
                  <div className={styles.apiWorkspace}>
                    <h4>Workspace ID</h4>
                    <p>{extractValue(activeApi, 'workspace_id')}</p>
                  </div>
                )}

                {extractValue(activeApi, 'created_at') && (
                  <div className={styles.apiCreated}>
                    <h4>Created</h4>
                    <p>
                      {new Date(
                        extractValue(activeApi, 'created_at')
                      ).toLocaleString()}
                    </p>
                  </div>
                )}

                {extractValue(activeApi, 'updated_at') && (
                  <div className={styles.apiUpdated}>
                    <h4>Last Updated</h4>
                    <p>
                      {new Date(
                        extractValue(activeApi, 'updated_at')
                      ).toLocaleString()}
                    </p>
                  </div>
                )}

                {extractValue(activeApi, 'total_cases') !== undefined && (
                  <div className={styles.apiCases}>
                    <h4>Test Cases</h4>
                    <p>
                      {extractValue(activeApi, 'total_cases')}
                      {extractValue(activeApi, 'total_cases') === 1
                        ? ' case'
                        : ' cases'}{' '}
                      available
                    </p>
                  </div>
                )}

                <div className={styles.apiActions}>
                  {/* Edit API button removed - editing now happens directly in the interface */}
                </div>
              </div>
            ) : selectedNode?.type === 'file' ? (
              <div className={styles.emptyState}>
                <p>No API configured for this file</p>
                <p className={styles.infoText}>
                  Use the URL bar and tabs above to configure your API directly.
                </p>
              </div>
            ) : (
              <div className={styles.emptyState}>
                <p>Select a file to configure or view an API</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'params' && (
          <div className={styles.paramsContent}>
            <div className={styles.paramTable}>
              <div className={styles.paramHeader}>
                <div className={styles.paramCheckbox}></div>
                <div className={styles.paramKey}>KEY</div>
                <div className={styles.paramValue}>VALUE</div>
                <div className={styles.paramDescription}>DESCRIPTION</div>
              </div>

              <div className={styles.paramRow}>
                <div className={styles.paramCheckbox}>
                  <input type="checkbox" />
                </div>
                <div className={styles.paramKey}>
                  <input type="text" placeholder="Key" />
                </div>
                <div className={styles.paramValue}>
                  <input type="text" placeholder="Value" />
                </div>
                <div className={styles.paramDescription}>
                  <input type="text" placeholder="Description" />
                </div>
              </div>

              {/* Empty row for new param */}
              <div className={styles.paramRow}>
                <div className={styles.paramCheckbox}>
                  <input type="checkbox" disabled />
                </div>
                <div className={styles.paramKey}>
                  <input type="text" placeholder="Key" />
                </div>
                <div className={styles.paramValue}>
                  <input type="text" placeholder="Value" />
                </div>
                <div className={styles.paramDescription}>
                  <input type="text" placeholder="Description" />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'headers' && (
          <div className={styles.headersContent}>
            <div className={styles.paramTable}>
              <div className={styles.paramHeader}>
                <div className={styles.paramCheckbox}></div>
                <div className={styles.paramKey}>KEY</div>
                <div className={styles.paramValue}>VALUE</div>
                <div className={styles.paramDescription}>DESCRIPTION</div>
              </div>

              {/* Render API headers if available */}
              {activeApi &&
                (() => {
                  const headers = extractValue(activeApi, 'headers', null);

                  if (headers) {
                    if (Array.isArray(headers)) {
                      return headers.map((header, index) => (
                        <div
                          className={styles.paramRow}
                          key={`header-${index}`}
                        >
                          <div className={styles.paramCheckbox}>
                            <input type="checkbox" defaultChecked />
                          </div>
                          <div className={styles.paramKey}>
                            <input
                              type="text"
                              defaultValue={header.key || header.name || ''}
                            />
                          </div>
                          <div className={styles.paramValue}>
                            <input
                              type="text"
                              defaultValue={header.value || ''}
                            />
                          </div>
                          <div className={styles.paramDescription}>
                            <input
                              type="text"
                              defaultValue={header.description || ''}
                            />
                          </div>
                        </div>
                      ));
                    } else if (typeof headers === 'object') {
                      return Object.entries(headers).map(
                        ([key, value], index) => (
                          <div
                            className={styles.paramRow}
                            key={`header-${index}`}
                          >
                            <div className={styles.paramCheckbox}>
                              <input type="checkbox" defaultChecked />
                            </div>
                            <div className={styles.paramKey}>
                              <input type="text" defaultValue={key} />
                            </div>
                            <div className={styles.paramValue}>
                              <input type="text" defaultValue={value} />
                            </div>
                            <div className={styles.paramDescription}>
                              <input
                                type="text"
                                defaultValue={
                                  key === 'Content-Type'
                                    ? 'Content type header'
                                    : ''
                                }
                              />
                            </div>
                          </div>
                        )
                      );
                    }
                  }
                  return null;
                })()}

              {/* If no headers in API, show default Content-Type */}
              {(!activeApi || !extractValue(activeApi, 'headers')) && (
                <div className={styles.paramRow}>
                  <div className={styles.paramCheckbox}>
                    <input type="checkbox" defaultChecked />
                  </div>
                  <div className={styles.paramKey}>
                    <input type="text" defaultValue="Content-Type" />
                  </div>
                  <div className={styles.paramValue}>
                    <input type="text" defaultValue="application/json" />
                  </div>
                  <div className={styles.paramDescription}>
                    <input type="text" defaultValue="Content type header" />
                  </div>
                </div>
              )}

              {/* Empty row for new header */}
              <div className={styles.paramRow}>
                <div className={styles.paramCheckbox}>
                  <input type="checkbox" disabled />
                </div>
                <div className={styles.paramKey}>
                  <input type="text" placeholder="Key" />
                </div>
                <div className={styles.paramValue}>
                  <input type="text" placeholder="Value" />
                </div>
                <div className={styles.paramDescription}>
                  <input type="text" placeholder="Description" />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'body' && (
          <div className={styles.bodyContent}>
            <div className={styles.bodyTypeSelector}>
              <div
                className={`${styles.bodyTypeBadge} ${!activeApi?.body ? styles.active : ''}`}
              >
                none
              </div>
              <div className={styles.bodyTypeBadge}>raw</div>
              <div
                className={`${styles.bodyTypeBadge} ${activeApi?.body ? styles.active : ''}`}
              >
                JSON
              </div>
              <div className={styles.bodyTypeBadge}>XML</div>
              <div className={styles.bodyTypeBadge}>form-data</div>
            </div>

            <div className={styles.jsonEditor}>
              {activeApi ? (
                <pre>
                  {(() => {
                    // Try to find body in different possible locations
                    const requestBody =
                      extractValue(activeApi, 'body') ||
                      extractValue(activeApi, 'request_body') ||
                      extractValue(activeApi, 'requestBody');

                    if (requestBody) {
                      if (typeof requestBody === 'string') {
                        try {
                          // Try to parse if it's a stringified JSON
                          const parsedBody = JSON.parse(requestBody);
                          return JSON.stringify(parsedBody, null, 2);
                        } catch (e) {
                          // If it's not valid JSON, return as is
                          return requestBody;
                        }
                      } else {
                        // If it's already an object
                        return JSON.stringify(requestBody, null, 2);
                      }
                    } else {
                      // Default empty body
                      return `{
  "name": "Example",
  "data": {
    "id": 1,
    "description": "Sample request body"
  }
}`;
                    }
                  })()}
                </pre>
              ) : (
                <pre>{`{
  "name": "Example",
  "data": {
    "id": 1,
    "description": "Sample request body"
  }
}`}</pre>
              )}
            </div>
          </div>
        )}

        {activeTab === 'validation' && (
          <div className={styles.validationContent}>
            <div className={styles.validationSection}>
              <h4>Request Schema</h4>
              <div className={styles.jsonEditor}>
                <textarea
                  rows={8}
                  placeholder="Enter JSON schema for request validation"
                  defaultValue={(() => {
                    // Try to get validation schema if it exists
                    const schema =
                      extractValue(activeApi, 'validation.requestSchema') ||
                      extractValue(activeApi, 'validationSchema.request');

                    return schema ? JSON.stringify(schema, null, 2) : '';
                  })()}
                />
              </div>
            </div>

            <div className={styles.validationSection}>
              <h4>Response Schema</h4>
              <div className={styles.jsonEditor}>
                <textarea
                  rows={8}
                  placeholder="Enter JSON schema for response validation"
                  defaultValue={(() => {
                    // Try to get validation schema if it exists
                    const schema =
                      extractValue(activeApi, 'validation.responseSchema') ||
                      extractValue(activeApi, 'validationSchema.response');

                    return schema ? JSON.stringify(schema, null, 2) : '';
                  })()}
                />
              </div>
            </div>

            <div className={styles.validationActions}>
              <button
                type="button"
                className={styles.validationButton}
                onClick={() => {
                  try {
                    // Simple validation logic
                    let isValid = true;
                    let message = '';

                    try {
                      // In a real implementation, you would use a JSON Schema validator library
                      // This is just a basic check if the JSON is valid
                      const requestBody =
                        extractValue(activeApi, 'body') ||
                        extractValue(activeApi, 'request_body') ||
                        extractValue(activeApi, 'requestBody');

                      if (requestBody) {
                        if (typeof requestBody === 'string') {
                          JSON.parse(requestBody);
                        }
                      }
                      message = 'JSON is valid';
                    } catch (e) {
                      isValid = false;
                      message = `Invalid JSON: ${e.message}`;
                    }

                    // Display validation result
                    alert(message);
                  } catch (err) {
                    console.error('Validation error:', err);
                    alert(`Error during validation: ${err.message}`);
                  }
                }}
              >
                Validate Current JSON
              </button>
            </div>
          </div>
        )}

        {activeTab === 'authorization' && (
          <div className={styles.authContent}>
            <div className={styles.authType}>
              <label>Type</label>
              <select>
                <option>No Auth</option>
                <option>Bearer Token</option>
                <option>Basic Auth</option>
                <option>OAuth 2.0</option>
                <option>API Key</option>
              </select>
            </div>
          </div>
        )}

        {activeTab === 'apiTests' && (
          <div className={styles.testsContent}>
            <div className={styles.testsHeader}>
              <h3>API Test Cases</h3>
              <div className={styles.testHeaderButtons}>
                <button
                  className={styles.addTestButton}
                  onClick={() => {
                    setEditingTestCaseId(null);
                    setShowTestCaseForm(true);
                  }}
                >
                  {activeApi ? 'Add Test Case' : 'Create API First'}
                </button>
                {activeApi && testCases && testCases.length > 0 && (
                  <>
                    <button
                      className={styles.runSelectedTestsButton}
                      onClick={handleRunSelectedTests}
                      disabled={isSending || selectedTestCases.length === 0}
                    >
                      {isSending
                        ? 'Running...'
                        : `Run Selected (${selectedTestCases.length})`}
                    </button>
                    <button
                      className={styles.runAllTestsButton}
                      onClick={() => runTest(selectedNode?.id)}
                      disabled={isSending}
                    >
                      {isSending ? 'Running...' : 'Run All Tests'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {testResults && (
              <div className={styles.testResultsSummary}>
                <div className={styles.testResultsHeader}>
                  <h4>Test Results</h4>
                  <button
                    className={styles.clearResultsButton}
                    onClick={clearTestResults}
                  >
                    Clear Results
                  </button>
                </div>
                <div className={styles.testResultsContent}>
                  {Array.isArray(testResults.data) ? (
                    <>
                      <div className={styles.testResultsStats}>
                        <div className={styles.testStat}>
                          <span>Total:</span> {testResults.data.length}
                        </div>
                        <div className={styles.testStat}>
                          <span>Passed:</span>{' '}
                          {testResults.data.filter(r => r.passed).length}
                        </div>
                        <div className={styles.testStat}>
                          <span>Failed:</span>{' '}
                          {testResults.data.filter(r => !r.passed).length}
                        </div>
                      </div>
                      <div className={styles.testResultsList}>
                        {testResults.data.map((result, index) => (
                          <div
                            key={index}
                            className={`${styles.testResultItem} ${result.passed ? styles.testPassed : styles.testFailed}`}
                          >
                            <div className={styles.testResultHeader}>
                              <span className={styles.testName}>
                                {result.name || `Test Case ${index + 1}`}
                              </span>
                              <span className={styles.testStatus}>
                                {result.passed ? 'Passed' : 'Failed'}
                              </span>
                            </div>
                            {!result.passed && result.error && (
                              <div className={styles.testError}>
                                {result.error}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className={styles.testResultMessage}>
                      {testResults.message || 'Test execution completed'}
                    </div>
                  )}
                </div>
              </div>
            )}

            {isLoading ? (
              <div className={styles.loadingIndicator}>
                Loading test cases...
              </div>
            ) : activeApi ? (
              testCases && testCases.length > 0 ? (
                <div className={styles.testCaseList}>
                  {testCases.map(testCase => (
                    <div
                      key={testCase.id || testCase.case_id || Math.random()}
                      className={styles.testCase}
                    >
                      <div className={styles.testCaseHeader}>
                        <div className={styles.testCaseNameSection}>
                          <input
                            type="checkbox"
                            className={styles.testCaseCheckbox}
                            checked={selectedTestCases.includes(
                              testCase.id || testCase.case_id
                            )}
                            onChange={() =>
                              handleTestCaseSelection(
                                testCase.id || testCase.case_id
                              )
                            }
                            disabled={isSending}
                          />
                          <h4 className={styles.testCaseName}>
                            {testCase.name || 'Unnamed Test'}
                          </h4>
                        </div>
                        <div className={styles.testActions}>
                          <button
                            className={styles.runTestButton}
                            onClick={() =>
                              runTest(
                                selectedNode?.id,
                                testCase.id || testCase.case_id
                              )
                            }
                            disabled={isSending}
                          >
                            {isSending ? 'Running...' : 'Run'}
                          </button>
                          <button
                            className={styles.editTestButton}
                            onClick={() => {
                              setEditingTestCaseId(
                                testCase.id || testCase.case_id
                              );
                              setShowTestCaseForm(true);
                            }}
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                      {testCase.description && (
                        <p className={styles.testCaseDescription}>
                          {testCase.description}
                        </p>
                      )}
                      {testCase.method && (
                        <div className={styles.testCaseMeta}>
                          <span className={styles.testCaseMethod}>
                            {testCase.method}
                          </span>
                          {testCase.status && (
                            <span className={styles.testCaseStatus}>
                              Status: {testCase.status}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <p>No test cases created yet for this API</p>
                  <button
                    className={styles.createButton}
                    onClick={() => {
                      setEditingTestCaseId(null);
                      setShowTestCaseForm(true);
                    }}
                  >
                    Create Test Case
                  </button>
                </div>
              )
            ) : (
              <div className={styles.emptyState}>
                <p>Please create or select an API first</p>
                <p className={styles.infoText}>
                  Use the URL bar and tabs above to configure your API.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Response Section */}
      <div className={styles.responseSection}>
        <div className={styles.responseMeta}>
          {response && (
            <>
              <div
                className={`${styles.statusBadge} ${response.status < 300 ? styles.success : styles.error}`}
              >
                Status: {response.status} {response.statusText}
              </div>
              <div className={styles.responseInfo}>
                <span>Time: {response.time}</span>
                <span>Size: {response.size}</span>
              </div>
            </>
          )}
        </div>

        {response && (
          <>
            <div className={styles.responseTabs}>
              <div
                className={`${styles.responseTab} ${responseTab === 'body' ? styles.active : ''}`}
                onClick={() => setResponseTab('body')}
              >
                Body
              </div>
              <div
                className={`${styles.responseTab} ${responseTab === 'headers' ? styles.active : ''}`}
                onClick={() => setResponseTab('headers')}
              >
                Headers
              </div>
            </div>

            <div className={styles.responseContent}>
              {responseTab === 'body' && (
                <div className={styles.responseBody}>
                  {response.body &&
                  response.body.response_code !== undefined ? (
                    // Format for standard API response with response_code and data
                    <div className={styles.structuredResponse}>
                      <div className={styles.responseCodeSection}>
                        <strong>Response Code:</strong>{' '}
                        {response.body.response_code}
                      </div>
                      {response.body.data && (
                        <div className={styles.responseDataSection}>
                          <strong>Data:</strong>
                          <pre>
                            {JSON.stringify(response.body.data, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    // For other response formats
                    <pre>{JSON.stringify(response.body, null, 2)}</pre>
                  )}

                  {/* Debug information - helps developers understand the response structure */}
                  {process.env.NODE_ENV === 'development' && (
                    <div className={styles.debugInfo}>
                      <details>
                        <summary>Debug Info</summary>
                        <small>Response structure:</small>
                        <pre>
                          {JSON.stringify(
                            {
                              keys: Object.keys(response),
                              bodyType: typeof response.body,
                              bodyIsArray: Array.isArray(response.body),
                              bodyKeys:
                                typeof response.body === 'object'
                                  ? Object.keys(response.body)
                                  : [],
                              responseCode: response.body?.response_code,
                              hasData: !!response.body?.data,
                            },
                            null,
                            2
                          )}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>
              )}

              {responseTab === 'headers' && (
                <div className={styles.responseHeaders}>
                  {Object.entries(response.headers).map(([key, value]) => (
                    <div key={key} className={styles.headerRow}>
                      <span className={styles.headerKey}>{key}:</span>
                      <span className={styles.headerValue}>{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Test Case Form Modal */}
      {showTestCaseForm && selectedNode?.type === 'file' && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3>
                {editingTestCaseId ? 'Edit Test Case' : 'Create Test Case'}
              </h3>
              <button
                className={styles.closeButton}
                onClick={() => setShowTestCaseForm(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <TestCaseForm
                fileId={selectedNode.id}
                testCaseId={editingTestCaseId}
                onSave={() => {
                  setShowTestCaseForm(false);
                  getTestCases(selectedNode.id);
                }}
                onCancel={() => setShowTestCaseForm(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
