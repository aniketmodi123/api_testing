import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { useApi } from '../../store/api';
import { useNode } from '../../store/node';
import { TestCaseForm } from '../TestCaseForm';
import styles from './RequestPanel.module.css';
import './buttonStyles.css';
import './dropdown.css';

// Copy to clipboard utility function
const copyToClipboard = async text => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy text: ', err);
    return false;
  }
};

// Reusable copy button component
const CopyButton = ({ textToCopy, className }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(textToCopy);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
    }
  };

  return (
    <button
      className={`${styles.copyButton} ${className || ''}`}
      onClick={handleCopy}
      title="Copy to clipboard"
    >
      {copied ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"
            fill="currentColor"
          />
        </svg>
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z"
            fill="currentColor"
          />
        </svg>
      )}
    </button>
  );
};

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

function normalizeBody(bodyContent, bodyType) {
  if (bodyType === 'none') return null;
  if (bodyType === 'JSON') {
    try {
      // For API /save endpoint, we should keep it as a string
      // This helps with the body serialization when sending to backend
      return bodyContent;
    } catch {
      return bodyContent; // Already a string
    }
  }
  return bodyContent; // Keep as string for all body types
}

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
    updateApi,
    saveApi,
    saveTestCase,
    duplicateApi,
    deleteTestCase,
  } = useApi();

  const [method, setMethod] = useState(
    activeRequest?.method || selectedNode?.method || 'GET'
  );
  const [url, setUrl] = useState(
    activeRequest?.url || selectedNode?.url || selectedNode?.endpoint || ''
  );
  const [isUpdatingConfig, setIsUpdatingConfig] = useState(false);
  const [showTestCaseForm, setShowTestCaseForm] = useState(false);
  const [editingTestCaseId, setEditingTestCaseId] = useState(null);
  const [bodyContent, setBodyContent] = useState('');
  const [bodyType, setBodyType] = useState('JSON');
  const [requestHeight, setRequestHeight] = useState(200); // Default height for request section

  // Handle resizing between request and response sections
  const startResize = useCallback(
    e => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = requestHeight;

      const doDrag = e => {
        const newHeight = startHeight + (e.clientY - startY);
        // Set min and max height constraints
        if (newHeight >= 100 && newHeight <= window.innerHeight - 200) {
          setRequestHeight(newHeight);
        }
      };

      const stopDrag = () => {
        document.removeEventListener('mousemove', doDrag);
        document.removeEventListener('mouseup', stopDrag);
      };

      document.addEventListener('mousemove', doDrag);
      document.addEventListener('mouseup', stopDrag);
    },
    [requestHeight]
  );

  // Update the panel when selectedNode changes
  // Add effect for handling dropdown close on outside click
  useEffect(() => {
    const closeDropdowns = () => {
      const dropdowns = document.querySelectorAll('.dropdownContent');
      dropdowns.forEach(dd => dd.classList.remove('active'));
    };

    document.addEventListener('click', closeDropdowns);

    return () => {
      document.removeEventListener('click', closeDropdowns);
    };
  }, []);

  // Initialize the body content and type when the activeApi changes
  useEffect(() => {
    if (activeApi) {
      const requestBody =
        extractValue(activeApi, 'body') ||
        extractValue(activeApi, 'request_body') ||
        extractValue(activeApi, 'requestBody');

      // Determine body type from the activeApi metadata or content
      const bodyTypeFromApi = extractValue(activeApi, 'bodyType') || 'JSON';
      setBodyType(bodyTypeFromApi);

      if (requestBody) {
        if (typeof requestBody === 'string') {
          try {
            // Try to parse as JSON to see if it's actually JSON formatted
            JSON.parse(requestBody);
            setBodyType('JSON');
            setBodyContent(requestBody);
          } catch (e) {
            // If not valid JSON, it might be raw text or XML
            if (
              requestBody.trim().startsWith('<') &&
              requestBody.includes('</')
            ) {
              setBodyType('XML');
            } else {
              setBodyType('raw');
            }
            setBodyContent(requestBody);
          }
        } else if (
          requestBody === null ||
          Object.keys(requestBody).length === 0
        ) {
          // Empty body
          setBodyType('none');
          setBodyContent('');
        } else {
          // If it's an object, stringify it and set to JSON
          setBodyType('JSON');
          setBodyContent(JSON.stringify(requestBody, null, 2));
        }
      } else {
        // Default empty body
        setBodyType('JSON');
        setBodyContent(`{
  "name": "Example",
  "data": {
    "id": 1,
    "description": "Sample request body"
  }
}`);
      }
    } else {
      // No active API, set default
      setBodyType('none');
      setBodyContent('');
    }
  }, [activeApi]);

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

            // Check if we got a 206 status (no API data)
            if (apiResponse.status === 206) {
              console.log('No API configured for this file yet.');
              // Keep the current values since there's no API data
            } else {
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
  const [defaultValidationSchema, setDefaultValidationSchema] = useState({
    status: 200,
    text_contains: 'success',
    headers_regex: {
      'content-type': '^application/json',
    },
    json: {
      checks: [
        { path: 'response_code', equals: 200 },
        { path: 'error_message', absent: true },
        { path: 'data', present: true },
      ],
      either: [
        {
          checks: [{ path: 'errors', present: true }],
        },
        {
          checks: [{ path: 'detail', present: true }],
        },
      ],
    },
    _mirror_http_status: true,
    _require_content_for_error: true,
  });

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

      // Get the validation schema from API or use default
      const validationSchema =
        extractValue(activeApi, 'expected') ||
        extractValue(activeApi, 'validation.responseSchema') ||
        extractValue(activeApi, 'validationSchema.response') ||
        defaultValidationSchema;

      // Create a test case with the current parameters
      const testCaseData = {
        name: `Validation test - ${new Date().toISOString()}`,
        description: 'Auto-generated test case with validation schema',
        method: method,
        endpoint: url,
        headers: extractValue(activeApi, 'headers', {}),
        params: extractValue(activeApi, 'params', {}),
        body: normalizeBody(bodyContent, bodyType),
        expected: validationSchema, // Store the validation schema directly in the expected field
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
          <div className="sendButtonContainer">
            <button
              className={`${styles.sendButton} overrideSendButton`}
              onClick={handleDirectApiCall} // Now uses direct call functionality instead of handleSend
              disabled={isSending || !url}
            >
              {isSending ? 'Sending...' : 'Send'}
            </button>

            <div className="dropdownContainer">
              <button
                className="dropdownButton"
                disabled={isSending}
                onClick={e => {
                  e.stopPropagation();
                  const dropdowns =
                    document.querySelectorAll('.dropdownContent');
                  dropdowns.forEach(dd => dd.classList.remove('active'));
                  e.currentTarget.nextElementSibling.classList.toggle('active');
                }}
              >
                ▼
              </button>
              <div
                className="dropdownContent"
                onClick={e => e.stopPropagation()}
              >
                <button
                  onClick={handleValidateApi}
                  disabled={isSending || !url || !selectedNode?.id}
                >
                  Validate
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="actionsContainer">
          <button
            className="actionsButton"
            onClick={async () => {
              if (!selectedNode?.id) {
                alert('Please select a file first');
                return;
              }

              setIsUpdatingConfig(true);

              try {
                // Prepare data for saving API (works for both create and update)
                const apiData = activeApi
                  ? {
                      // Update existing API
                      ...activeApi,
                      method: method,
                      endpoint: url,
                      headers: extractValue(activeApi, 'headers', {}),
                      params: extractValue(activeApi, 'params', {}),
                      body: normalizeBody(bodyContent, bodyType),
                      bodyType: bodyType,
                    }
                  : {
                      // Create new API
                      name: selectedNode.name || 'New API',
                      method: method,
                      endpoint: url,
                      description: '',
                      is_active: true,
                      headers: {},
                      params: {},
                      body: normalizeBody(bodyContent, bodyType),
                      bodyType: bodyType,
                    };

                // Use the unified saveApi function for both create and update
                const result = await saveApi(selectedNode.id, apiData);

                console.log('API saved successfully:', result);

                const message = activeApi
                  ? 'API configuration updated successfully'
                  : 'New API created successfully';

                alert(message);

                // Reload the API details if this was a new API
                if (!activeApi) {
                  await getApi(selectedNode.id);
                }
              } catch (err) {
                console.error('Error saving API configuration:', err);
                alert(`Failed to save configuration: ${err.message}`);
              } finally {
                setIsUpdatingConfig(false);
              }
            }}
            disabled={isUpdatingConfig}
            title="Save API"
          >
            {isUpdatingConfig ? 'Saving...' : 'Save'}
          </button>
          <div className="dropdownContainer">
            <button
              className="dropdownButton"
              onClick={e => {
                e.stopPropagation();
                const dropdowns = document.querySelectorAll('.dropdownContent');
                dropdowns.forEach(dd => dd.classList.remove('active'));
                e.currentTarget.nextElementSibling.classList.toggle('active');
              }}
            >
              ▼
            </button>
            <div
              className="dropdownContent saveActionsDropdown"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={async () => {
                  if (!response) {
                    alert('Send a request first to record as a test case');
                    return;
                  }

                  // Start with button in saving state
                  const button = document.querySelector(
                    '.saveActionsDropdown button'
                  );
                  const originalText = button.innerText;
                  button.innerText = 'Saving...';
                  button.disabled = true;

                  // Save the current request/response as a test case
                  try {
                    // Get the validation schema from the validation tab textarea
                    const schemaTextarea = document.getElementById(
                      'validationSchemaTextarea'
                    );
                    let validationSchema;

                    try {
                      if (schemaTextarea && schemaTextarea.value) {
                        validationSchema = JSON.parse(schemaTextarea.value);
                      } else {
                        // Get schema from active API or use default
                        validationSchema =
                          extractValue(activeApi, 'expected') ||
                          extractValue(
                            activeApi,
                            'validation.responseSchema'
                          ) ||
                          extractValue(
                            activeApi,
                            'validationSchema.response'
                          ) ||
                          defaultValidationSchema;
                      }
                    } catch (e) {
                      console.warn(
                        'Failed to parse validation schema, using default',
                        e
                      );
                      validationSchema = defaultValidationSchema;
                    }

                    // Ask user for a custom test case name
                    const defaultName = `Test case - ${new Date().toLocaleTimeString()}`;
                    const customName = prompt(
                      'Enter a name for this test case:',
                      defaultName
                    );

                    // Format the test case data according to the FastAPI endpoint requirements
                    // Get the request headers from the current request
                    const requestHeaders = extractValue(
                      activeApi,
                      'headers',
                      {}
                    );

                    const testCaseData = {
                      name: customName || defaultName, // Use custom name or fall back to default
                      // Pass headers directly as object
                      headers: requestHeaders,
                      // Pass body as string if it's JSON or other formats
                      body: bodyType === 'none' ? null : bodyContent,
                      // Use the validation schema from the validation tab
                      expected: validationSchema,
                    };

                    console.log('Recording test case with data:', testCaseData);

                    // Check if required values are present
                    if (!selectedNode?.id) {
                      console.error(
                        'Missing selectedNode.id when trying to save test case'
                      );
                      alert(
                        'Error: No API selected. Please select an API first.'
                      );
                      return;
                    }

                    console.log(
                      'Selected node for saving test case:',
                      selectedNode
                    );

                    try {
                      // Use our saveTestCase function
                      const result = await saveTestCase(
                        selectedNode.id,
                        testCaseData
                      );

                      console.log('Save test case result:', result);

                      if (result && (result.data || result.success)) {
                        alert('Test case saved successfully!');
                        // Refresh the test cases list
                        await getTestCases(selectedNode.id);
                      } else {
                        alert('Failed to save test case. Please try again.');
                      }

                      // Close the dropdown after action
                      document
                        .querySelector('.saveActionsDropdown')
                        .classList.remove('active');
                    } catch (saveError) {
                      console.error('Error in saveTestCase:', saveError);
                      alert(
                        `Error saving test case: ${saveError.message || 'Unknown error'}`
                      );
                    }
                  } catch (err) {
                    console.error('Error recording test case:', err);
                    if (err.response) {
                      console.error('Error response:', err.response.data);
                      console.error('Status:', err.response.status);
                    }
                    alert(
                      `Error saving test case: ${err.message || 'Unknown error'}`
                    );
                  } finally {
                    // Reset button state
                    button.innerText = originalText;
                    button.disabled = false;
                  }
                }}
                disabled={!response || !selectedNode?.id}
                title="Record current request/response as a test case"
              >
                Record as Test Case
              </button>
            </div>
          </div>
        </div>
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
      <div
        className={styles.tabContent}
        style={{ height: `${requestHeight}px` }}
      >
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

                {/* Workspace ID removed as per request */}

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
                className={`${styles.bodyTypeBadge} ${bodyType === 'none' ? styles.active : ''}`}
                onClick={() => {
                  setBodyType('none');
                  setBodyContent('');
                }}
              >
                none
              </div>
              <div
                className={`${styles.bodyTypeBadge} ${bodyType === 'raw' ? styles.active : ''}`}
                onClick={() => {
                  setBodyType('raw');
                  // If coming from JSON, try to remove formatting
                  if (bodyType === 'JSON') {
                    try {
                      const obj = JSON.parse(bodyContent);
                      setBodyContent(JSON.stringify(obj));
                    } catch (e) {
                      // Keep content as is if not valid JSON
                    }
                  }
                }}
              >
                raw
              </div>
              <div
                className={`${styles.bodyTypeBadge} ${bodyType === 'JSON' ? styles.active : ''}`}
                onClick={() => {
                  setBodyType('JSON');
                  // If coming from raw and content might be JSON, try to format it
                  if (bodyType === 'raw' && bodyContent.trim()) {
                    try {
                      const obj = JSON.parse(bodyContent);
                      setBodyContent(JSON.stringify(obj, null, 2));
                    } catch (e) {
                      // If not valid JSON, initialize with empty JSON object
                      if (
                        !bodyContent.includes('{') &&
                        !bodyContent.includes('[')
                      ) {
                        setBodyContent('{}');
                      }
                    }
                  } else if (bodyType === 'none' || !bodyContent) {
                    // Set a default JSON if coming from none
                    setBodyContent(`{}`);
                  }
                }}
              >
                JSON
              </div>
              <div
                className={`${styles.bodyTypeBadge} ${bodyType === 'XML' ? styles.active : ''}`}
                onClick={() => {
                  setBodyType('XML');
                  if (bodyType === 'none' || !bodyContent) {
                    // Set a default XML if coming from none
                    setBodyContent(`<root>
  <name>Example</name>
  <data>
    <id>1</id>
    <description>Sample request body</description>
  </data>
</root>`);
                  }
                }}
              >
                XML
              </div>
              <div
                className={`${styles.bodyTypeBadge} ${bodyType === 'form-data' ? styles.active : ''}`}
                onClick={() => {
                  setBodyType('form-data');
                  // For simplicity, we'll keep the text representation of form data
                  if (bodyType === 'none' || !bodyContent) {
                    setBodyContent(
                      'name=Example&id=1&description=Sample+request+body'
                    );
                  }
                }}
              >
                form-data
              </div>
            </div>

            {bodyType !== 'none' && (
              <div
                className={`${styles.jsonEditor} ${styles[bodyType.toLowerCase() + 'Editor']} scrollable ${styles.jsonContainer}`}
              >
                {bodyType === 'JSON' && <CopyButton textToCopy={bodyContent} />}
                <textarea
                  className={styles.bodyTextarea}
                  value={bodyContent}
                  onChange={e => {
                    setBodyContent(e.target.value);
                  }}
                  placeholder={
                    bodyType === 'raw'
                      ? 'Enter raw text'
                      : bodyType === 'JSON'
                        ? 'Enter JSON data'
                        : bodyType === 'XML'
                          ? 'Enter XML data'
                          : bodyType === 'form-data'
                            ? 'name=value&name2=value2'
                            : ''
                  }
                />
              </div>
            )}
            {bodyType === 'none' && (
              <div className={styles.emptyBodyMessage}>
                <p>This request does not have a body</p>
              </div>
            )}
            {bodyType === 'form-data' && (
              <div className={styles.formDataHelp}>
                <p>
                  Form data will be sent as application/x-www-form-urlencoded
                </p>
                <p>Format: key1=value1&key2=value2</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'validation' && (
          <div className={styles.validationContent}>
            <div className={styles.validationSection}>
              <div
                className={`${styles.jsonEditor} scrollable ${styles.jsonContainer}`}
              >
                <CopyButton
                  textToCopy={(() => {
                    const schema =
                      extractValue(activeApi, 'expected') ||
                      extractValue(activeApi, 'validation.responseSchema') ||
                      defaultValidationSchema;
                    return typeof schema === 'string'
                      ? schema
                      : JSON.stringify(schema, null, 2);
                  })()}
                />
                <textarea
                  id="validationSchemaTextarea"
                  rows={16}
                  placeholder="Enter validation schema for API responses"
                  defaultValue={(() => {
                    // Try to get validation schema if it exists
                    const schema =
                      extractValue(activeApi, 'expected') ||
                      extractValue(activeApi, 'validation.responseSchema') ||
                      extractValue(activeApi, 'validationSchema.response');

                    // If no schema exists, use our default validation schema
                    return schema
                      ? JSON.stringify(schema, null, 2)
                      : JSON.stringify(defaultValidationSchema, null, 2);
                  })()}
                />
              </div>
            </div>

            {/* Validation buttons have been removed as requested */}
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
                  {activeApi ? 'Add Test Case' : 'Save API First'}
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
                  {(() => {
                    const resultsArray =
                      testResults.test_cases ?? testResults.data ?? [];

                    if (
                      Array.isArray(resultsArray) &&
                      resultsArray.length > 0
                    ) {
                      return (
                        <>
                          <div className={styles.testResultsStats}>
                            <div className={styles.testStat}>
                              <span>Total:</span> {resultsArray.length}
                            </div>
                            <div className={styles.testStat}>
                              <span>Passed:</span>{' '}
                              {resultsArray.filter(r => r.passed).length}
                            </div>
                            <div className={styles.testStat}>
                              <span>Failed:</span>{' '}
                              {resultsArray.filter(r => !r.passed).length}
                            </div>
                          </div>
                          <div className={styles.testResultsList}>
                            {resultsArray.map((result, index) => (
                              <div
                                key={result.id ?? index}
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
                      );
                    }

                    return (
                      <div className={styles.testResultMessage}>
                        {testResults.message || 'Test execution completed'}
                      </div>
                    );
                  })()}
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
                          <button
                            className={styles.deleteTestButton}
                            onClick={async () => {
                              const id = testCase.id || testCase.case_id;
                              const confirmDelete = window.confirm(
                                'Delete this test case?'
                              );
                              if (!confirmDelete) return;
                              try {
                                await deleteTestCase(id);
                                // Refresh list after deletion
                                getTestCases(selectedNode.id);
                              } catch (err) {
                                console.error(
                                  'Failed to delete test case:',
                                  err
                                );
                              }
                            }}
                          >
                            Delete
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

      {/* Resizable handle */}
      <div
        className={styles.resizeHandle}
        onMouseDown={startResize}
        title="Drag to resize"
      >
        {/* This is the draggable resize handle */}
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
                <div className={`${styles.responseBody} scrollable`}>
                  {response.body &&
                  response.body.response_code !== undefined ? (
                    // Format for standard API response with response_code and data
                    <div className={styles.structuredResponse}>
                      {response.body.data && (
                        <div
                          className={`${styles.responseDataSection} ${styles.jsonContainer}`}
                        >
                          <CopyButton
                            textToCopy={JSON.stringify(response.body, null, 2)}
                          />
                          <pre>{JSON.stringify(response.body, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    // For other response formats
                    <div className={styles.jsonContainer}>
                      <CopyButton
                        textToCopy={JSON.stringify(response.body, null, 2)}
                      />
                      <pre>{JSON.stringify(response.body, null, 2)}</pre>
                    </div>
                  )}
                </div>
              )}

              {responseTab === 'headers' && (
                <div className={`${styles.responseHeaders} scrollable`}>
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
                caseId={editingTestCaseId}
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
