import { useEffect, useState } from 'react';
import { useApi } from '../../store/api';
import styles from './ApiForm.module.css';

/**
 * Component for directly creating and editing APIs in the tester view
 */
const ApiForm = ({
  fileId,
  apiId = null,
  onSave = () => {},
  onCancel = () => {},
}) => {
  const [activeTab, setActiveTab] = useState('basic'); // basic, headers, params, body, authorization, validation, tests
  const [formData, setFormData] = useState({
    name: '',
    method: 'GET',
    endpoint: '',
    description: '',
    is_active: true,
    authorization: {
      type: 'none', // none, basic, bearer, oauth2, api-key
      username: '',
      password: '',
      token: '',
      key: '',
      value: '',
      addTo: 'header', // header, query
    },
    headers: {},
    params: {},
    request_body: {},
    validation: {
      requestSchema: {},
      responseSchema: {},
      rules: [],
    },
    expected: {
      status: 200,
      headers: {},
      body: {},
    },
    tests: [],
    extra_meta: {},
  });

  // For JSON validation
  const [validationResult, setValidationResult] = useState(null);

  const { createApi, getApi, updateApi, isLoading, error, activeApi } =
    useApi();

  // Load API data if editing an existing API
  useEffect(() => {
    const loadApi = async () => {
      if (apiId) {
        try {
          await getApi(apiId);
        } catch (err) {
          console.error('Failed to load API:', err);
        }
      }
    };

    loadApi();
  }, [apiId, getApi]);

  // Update form when activeApi changes
  useEffect(() => {
    if (activeApi && apiId) {
      setFormData({
        name: activeApi.name || '',
        method: activeApi.method || 'GET',
        endpoint: activeApi.endpoint || '',
        description: activeApi.description || '',
        is_active: activeApi.is_active ?? true,
        headers: activeApi.headers || {},
        params: activeApi.params || {},
        request_body: activeApi.request_body || {},
        expected: {
          status: activeApi.expected?.status || 200,
          headers: activeApi.expected?.headers || {},
          body: activeApi.expected?.body || {},
        },
        extra_meta: activeApi.extra_meta || {},
      });
    }
  }, [activeApi, apiId]);

  // Handle form input changes
  const handleChange = e => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  // Handle JSON field changes
  const handleJsonChange = (field, e) => {
    try {
      const jsonValue = e.target.value ? JSON.parse(e.target.value) : {};
      setFormData(prev => ({
        ...prev,
        [field]: jsonValue,
      }));
    } catch (err) {
      // Don't update if invalid JSON
      console.error(`Invalid JSON for ${field}:`, err);
    }
  };

  // Handle header changes
  const handleHeaderChange = (index, key, value) => {
    const updatedHeaders = { ...formData.headers };

    // Remove old key if changing key
    if (index !== -1 && Object.keys(updatedHeaders)[index] !== key) {
      const oldKey = Object.keys(updatedHeaders)[index];
      delete updatedHeaders[oldKey];
    }

    updatedHeaders[key] = value;

    setFormData(prev => ({
      ...prev,
      headers: updatedHeaders,
    }));
  };

  // Handle parameter changes
  const handleParamChange = (index, key, value) => {
    const updatedParams = { ...formData.params };

    // Remove old key if changing key
    if (index !== -1 && Object.keys(updatedParams)[index] !== key) {
      const oldKey = Object.keys(updatedParams)[index];
      delete updatedParams[oldKey];
    }

    updatedParams[key] = value;

    setFormData(prev => ({
      ...prev,
      params: updatedParams,
    }));
  };

  // Handle removal of header or param
  const handleRemove = (field, key) => {
    const updatedObj = { ...formData[field] };
    delete updatedObj[key];

    setFormData(prev => ({
      ...prev,
      [field]: updatedObj,
    }));
  };

  // Handle extra_meta changes (JSON field)
  const handleMetaChange = e => {
    handleJsonChange('extra_meta', e);
  };

  // Track response data from API tests
  const [responseData, setResponseData] = useState(null);
  const [isTestRunning, setIsTestRunning] = useState(false);

  // Handle API test/submission
  const handleSubmit = async e => {
    if (e) e.preventDefault();
    setIsTestRunning(true);

    try {
      // Prepare the request
      const requestData = {
        method: formData.method,
        url: formData.endpoint,
        headers: formData.headers,
        params: formData.params,
        data: formData.method !== 'GET' ? formData.request_body : undefined,
      };

      console.log('Executing API request:', requestData);

      // In a real implementation, you would make an actual API call here
      // For now, let's simulate a response
      setTimeout(() => {
        const mockResponse = {
          status: 200,
          statusText: 'OK',
          data: {
            success: true,
            message: 'Operation completed successfully',
            timestamp: new Date().toISOString(),
          },
          headers: {
            'content-type': 'application/json',
            'x-request-id': Math.random().toString(36).substring(2),
          },
          config: requestData,
          duration: Math.floor(Math.random() * 500) + 100, // ms
        };

        setResponseData(mockResponse);
        setIsTestRunning(false);

        // Save the API definition if needed
        saveApiDefinition();
      }, 800);
    } catch (err) {
      console.error('Error executing API:', err);
      setIsTestRunning(false);

      // Set error response
      setResponseData({
        status: 500,
        statusText: 'Error',
        error: err.message || 'Unknown error occurred',
      });
    }
  };

  // Save API definition without testing
  const saveApiDefinition = async () => {
    try {
      let result;

      if (apiId) {
        // Update existing API
        result = await updateApi(apiId, formData);
      } else {
        // Create new API
        result = await createApi(fileId, formData);
      }

      onSave(result?.data);
    } catch (err) {
      console.error('Error saving API definition:', err);
    }
  };

  // Save API request configuration (params, headers, body) without changing general info
  const saveRequestConfig = async () => {
    try {
      if (apiId) {
        // Only update the API request configuration parts
        const configOnlyData = {
          ...activeApi,
          method: formData.method,
          endpoint: formData.endpoint,
          headers: formData.headers,
          params: formData.params,
          request_body: formData.request_body,
          authorization: formData.authorization,
        };

        await updateApi(apiId, configOnlyData);
        console.log('Request configuration updated');
      } else {
        // If no API ID, we need to create a new API
        await saveApiDefinition();
      }
    } catch (err) {
      console.error('Error saving request configuration:', err);
    }
  };

  // Save a test case based on current request/response
  const saveAsTestCase = async () => {
    if (!responseData) {
      console.error('No response data available to save as a test case');
      return;
    }

    try {
      const testCase = {
        api_id: apiId,
        name: `Test case - ${new Date().toLocaleTimeString()}`,
        request: {
          method: formData.method,
          endpoint: formData.endpoint,
          headers: formData.headers,
          params: formData.params,
          body: formData.request_body,
        },
        expected_response: {
          status: responseData.status,
          headers: responseData.headers || {},
          body: responseData.data || {},
        },
        created_at: new Date().toISOString(),
      };

      // In a real implementation, you would save this to your backend
      console.log('Saving test case:', testCase);
      alert('Test case saved successfully');
    } catch (err) {
      console.error('Error saving test case:', err);
    }
  };

  return (
    <div className={styles.apiTester}>
      {/* Header with HTTP Method selector and Endpoint input */}
      <div className={styles.apiHeader}>
        <select
          id="method"
          name="method"
          value={formData.method}
          onChange={handleChange}
          className={styles.methodSelector}
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
          <option value="PATCH">PATCH</option>
          <option value="OPTIONS">OPTIONS</option>
          <option value="HEAD">HEAD</option>
        </select>

        <input
          type="text"
          id="endpoint"
          name="endpoint"
          value={formData.endpoint}
          onChange={handleChange}
          required
          placeholder="/api/resource"
          className={styles.endpointInput}
        />

        <button
          type="button"
          className={styles.sendButton}
          onClick={handleSubmit}
          disabled={isLoading}
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>

        <button
          type="button"
          className={styles.saveButton}
          onClick={saveApiDefinition}
          disabled={isLoading}
        >
          Save
        </button>

        <button
          type="button"
          className={styles.actionButton}
          onClick={saveRequestConfig}
          disabled={isLoading}
          title="Update request configuration (params, headers, body)"
        >
          Update Config
        </button>

        <button
          type="button"
          className={styles.actionButton}
          onClick={saveAsTestCase}
          disabled={isLoading || !responseData}
          title="Save current request/response as a test case"
        >
          Record as Case
        </button>
      </div>{' '}
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.tabContainer}>
        <div
          className={`${styles.tab} ${activeTab === 'basic' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('basic')}
        >
          API Details
        </div>
        <div
          className={`${styles.tab} ${activeTab === 'params' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('params')}
        >
          Params
        </div>
        <div
          className={`${styles.tab} ${activeTab === 'authorization' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('authorization')}
        >
          Authorization
        </div>
        <div
          className={`${styles.tab} ${activeTab === 'headers' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('headers')}
        >
          Headers
        </div>
        <div
          className={`${styles.tab} ${activeTab === 'body' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('body')}
        >
          Body
        </div>
        <div
          className={`${styles.tab} ${activeTab === 'validation' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('validation')}
        >
          Validation
        </div>
        <div
          className={`${styles.tab} ${activeTab === 'tests' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('tests')}
        >
          API Tests
        </div>
      </div>
      <form onSubmit={handleSubmit}>
        {/* API Details Tab */}
        <div
          className={styles.tabContent}
          style={{ display: activeTab === 'basic' ? 'block' : 'none' }}
        >
          <div className={styles.formGroup}>
            <label htmlFor="name">API Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="Enter API name"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="API description"
              rows={3}
            />
          </div>

          <div className={styles.detailsSection}>
            <div className={styles.detailRow}>
              <div className={styles.detailLabel}>Created</div>
              <div className={styles.detailValue}>
                {apiId ? new Date().toLocaleString() : 'Not saved yet'}
              </div>
            </div>

            <div className={styles.detailRow}>
              <div className={styles.detailLabel}>Last Modified</div>
              <div className={styles.detailValue}>
                {apiId ? new Date().toLocaleString() : 'Not saved yet'}
              </div>
            </div>

            <div className={styles.testCasesSection}>
              <h3>Test Cases</h3>
              <div className={styles.testCasesList}>
                {apiId ? (
                  <div className={styles.testCaseCount}>
                    {Math.floor(Math.random() * 5)} cases available
                  </div>
                ) : (
                  <div className={styles.testCaseCount}>
                    Save API first to add test cases
                  </div>
                )}
              </div>
              {apiId && (
                <button className={styles.secondaryButton}>Run Tests</button>
              )}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                name="is_active"
                checked={formData.is_active}
                onChange={handleChange}
              />
              <span>Active</span>
            </label>
          </div>
        </div>

        {/* Authorization Tab */}
        <div
          className={styles.tabContent}
          style={{ display: activeTab === 'authorization' ? 'block' : 'none' }}
        >
          <h3>Authorization</h3>
          <div className={styles.formGroup}>
            <label htmlFor="authType">Type</label>
            <select
              id="authType"
              name="authorization.type"
              value={formData.authorization.type}
              onChange={e => {
                setFormData({
                  ...formData,
                  authorization: {
                    ...formData.authorization,
                    type: e.target.value,
                  },
                });
              }}
              className={styles.authTypeSelector}
            >
              <option value="none">No Auth</option>
              <option value="basic">Basic Auth</option>
              <option value="bearer">Bearer Token</option>
              <option value="api-key">API Key</option>
              <option value="oauth2">OAuth 2.0</option>
            </select>
          </div>

          {formData.authorization.type === 'basic' && (
            <>
              <div className={styles.formGroup}>
                <label htmlFor="username">Username</label>
                <input
                  type="text"
                  id="username"
                  value={formData.authorization.username}
                  onChange={e => {
                    setFormData({
                      ...formData,
                      authorization: {
                        ...formData.authorization,
                        username: e.target.value,
                      },
                    });
                  }}
                  placeholder="Username"
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="password">Password</label>
                <input
                  type="password"
                  id="password"
                  value={formData.authorization.password}
                  onChange={e => {
                    setFormData({
                      ...formData,
                      authorization: {
                        ...formData.authorization,
                        password: e.target.value,
                      },
                    });
                  }}
                  placeholder="Password"
                />
              </div>
            </>
          )}

          {formData.authorization.type === 'bearer' && (
            <div className={styles.formGroup}>
              <label htmlFor="token">Token</label>
              <input
                type="text"
                id="token"
                value={formData.authorization.token}
                onChange={e => {
                  setFormData({
                    ...formData,
                    authorization: {
                      ...formData.authorization,
                      token: e.target.value,
                    },
                  });
                }}
                placeholder="Bearer token"
              />
            </div>
          )}

          {formData.authorization.type === 'api-key' && (
            <>
              <div className={styles.formGroup}>
                <label htmlFor="key">Key</label>
                <input
                  type="text"
                  id="key"
                  value={formData.authorization.key}
                  onChange={e => {
                    setFormData({
                      ...formData,
                      authorization: {
                        ...formData.authorization,
                        key: e.target.value,
                      },
                    });
                  }}
                  placeholder="API key name"
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="value">Value</label>
                <input
                  type="text"
                  id="value"
                  value={formData.authorization.value}
                  onChange={e => {
                    setFormData({
                      ...formData,
                      authorization: {
                        ...formData.authorization,
                        value: e.target.value,
                      },
                    });
                  }}
                  placeholder="API key value"
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="addTo">Add to</label>
                <select
                  id="addTo"
                  value={formData.authorization.addTo}
                  onChange={e => {
                    setFormData({
                      ...formData,
                      authorization: {
                        ...formData.authorization,
                        addTo: e.target.value,
                      },
                    });
                  }}
                >
                  <option value="header">Header</option>
                  <option value="query">Query Params</option>
                </select>
              </div>
            </>
          )}
        </div>

        {/* Headers Tab */}
        <div
          className={styles.tabContent}
          style={{ display: activeTab === 'headers' ? 'block' : 'none' }}
        >
          <h3>Request Headers</h3>
          {Object.entries(formData.headers).map(([key, value], index) => (
            <div className={styles.keyValueRow} key={`header-${index}`}>
              <input
                type="text"
                value={key}
                onChange={e => handleHeaderChange(index, e.target.value, value)}
                placeholder="Header name"
              />
              <input
                type="text"
                value={value}
                onChange={e => handleHeaderChange(index, key, e.target.value)}
                placeholder="Header value"
              />
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => handleRemove('headers', key)}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className={styles.addButton}
            onClick={() =>
              handleHeaderChange(
                -1,
                `header${Object.keys(formData.headers).length + 1}`,
                ''
              )
            }
          >
            + Add Header
          </button>

          <div className={styles.jsonEditor}>
            <label htmlFor="headers_json">Headers as JSON:</label>
            <textarea
              id="headers_json"
              value={JSON.stringify(formData.headers, null, 2)}
              onChange={e => handleJsonChange('headers', e)}
              rows={5}
              placeholder="{}"
            />
          </div>
        </div>

        {/* Parameters Tab */}
        <div
          className={styles.tabContent}
          style={{ display: activeTab === 'params' ? 'block' : 'none' }}
        >
          <h3>Query Parameters</h3>
          {Object.entries(formData.params).map(([key, value], index) => (
            <div className={styles.keyValueRow} key={`param-${index}`}>
              <input
                type="text"
                value={key}
                onChange={e => handleParamChange(index, e.target.value, value)}
                placeholder="Parameter name"
              />
              <input
                type="text"
                value={value}
                onChange={e => handleParamChange(index, key, e.target.value)}
                placeholder="Parameter value"
              />
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => handleRemove('params', key)}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className={styles.addButton}
            onClick={() =>
              handleParamChange(
                -1,
                `param${Object.keys(formData.params).length + 1}`,
                ''
              )
            }
          >
            + Add Parameter
          </button>

          <div className={styles.jsonEditor}>
            <label htmlFor="params_json">Parameters as JSON:</label>
            <textarea
              id="params_json"
              value={JSON.stringify(formData.params, null, 2)}
              onChange={e => handleJsonChange('params', e)}
              rows={5}
              placeholder="{}"
            />
          </div>
        </div>

        {/* Body Tab */}
        <div
          className={styles.tabContent}
          style={{ display: activeTab === 'body' ? 'block' : 'none' }}
        >
          <h3>Request Body</h3>
          <div className={styles.jsonEditor}>
            <textarea
              id="request_body"
              value={JSON.stringify(formData.request_body, null, 2)}
              onChange={e => handleJsonChange('request_body', e)}
              rows={15}
              placeholder="{}"
            />
          </div>
        </div>

        {/* Validation Tab */}
        <div
          className={styles.tabContent}
          style={{ display: activeTab === 'validation' ? 'block' : 'none' }}
        >
          <h3>JSON Validation</h3>

          <div className={styles.validationSection}>
            <h4>Request Schema</h4>
            <div className={styles.jsonEditor}>
              <textarea
                value={JSON.stringify(
                  formData.validation.requestSchema,
                  null,
                  2
                )}
                onChange={e => {
                  try {
                    const schema = e.target.value
                      ? JSON.parse(e.target.value)
                      : {};
                    setFormData(prev => ({
                      ...prev,
                      validation: {
                        ...prev.validation,
                        requestSchema: schema,
                      },
                    }));
                  } catch (err) {
                    console.error('Invalid JSON schema:', err);
                  }
                }}
                rows={8}
                placeholder="Enter JSON schema for request validation"
              />
            </div>
          </div>

          <div className={styles.validationSection}>
            <h4>Response Schema</h4>
            <div className={styles.jsonEditor}>
              <textarea
                value={JSON.stringify(
                  formData.validation.responseSchema,
                  null,
                  2
                )}
                onChange={e => {
                  try {
                    const schema = e.target.value
                      ? JSON.parse(e.target.value)
                      : {};
                    setFormData(prev => ({
                      ...prev,
                      validation: {
                        ...prev.validation,
                        responseSchema: schema,
                      },
                    }));
                  } catch (err) {
                    console.error('Invalid JSON schema:', err);
                  }
                }}
                rows={8}
                placeholder="Enter JSON schema for response validation"
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
                    JSON.parse(JSON.stringify(formData.request_body));
                    message = 'JSON is valid';
                  } catch (e) {
                    isValid = false;
                    message = `Invalid JSON: ${e.message}`;
                  }

                  setValidationResult({
                    isValid,
                    message,
                  });
                } catch (err) {
                  console.error('Validation error:', err);
                  setValidationResult({
                    isValid: false,
                    message: `Error during validation: ${err.message}`,
                  });
                }
              }}
            >
              Validate Current JSON
            </button>
          </div>

          {validationResult && (
            <div
              className={`${styles.validationResult} ${validationResult.isValid ? styles.validSuccess : styles.validError}`}
            >
              {validationResult.message}
            </div>
          )}
        </div>

        {/* API Tests Tab */}
        <div
          className={styles.tabContent}
          style={{ display: activeTab === 'tests' ? 'block' : 'none' }}
        >
          <h3>Expected Response</h3>

          <div className={styles.formGroup}>
            <label htmlFor="expected_status">Expected Status Code</label>
            <input
              type="number"
              id="expected_status"
              name="expected_status"
              value={formData.expected?.status || 200}
              onChange={e =>
                setFormData(prev => ({
                  ...prev,
                  expected: {
                    ...prev.expected,
                    status: parseInt(e.target.value) || 200,
                  },
                }))
              }
              min="100"
              max="599"
            />
          </div>

          <h4>Expected Headers</h4>
          <div className={styles.jsonEditor}>
            <textarea
              id="expected_headers"
              value={JSON.stringify(formData.expected?.headers || {}, null, 2)}
              onChange={e => {
                try {
                  const headersValue = e.target.value
                    ? JSON.parse(e.target.value)
                    : {};
                  setFormData(prev => ({
                    ...prev,
                    expected: {
                      ...prev.expected,
                      headers: headersValue,
                    },
                  }));
                } catch (err) {
                  console.error('Invalid JSON for expected headers:', err);
                }
              }}
              rows={5}
              placeholder="{}"
            />
          </div>

          <h4>Expected Body</h4>
          <div className={styles.jsonEditor}>
            <textarea
              id="expected_body"
              value={JSON.stringify(formData.expected?.body || {}, null, 2)}
              onChange={e => {
                try {
                  const bodyValue = e.target.value
                    ? JSON.parse(e.target.value)
                    : {};
                  setFormData(prev => ({
                    ...prev,
                    expected: {
                      ...prev.expected,
                      body: bodyValue,
                    },
                  }));
                } catch (err) {
                  console.error('Invalid JSON for expected body:', err);
                }
              }}
              rows={10}
              placeholder="{}"
            />
          </div>
        </div>

        {/* Extra Metadata Tab - Can be shown in Basic tab or as a separate tab */}
        <div
          className={styles.formGroup}
          style={{ display: activeTab === 'basic' ? 'block' : 'none' }}
        >
          <label htmlFor="extra_meta">Extra Metadata (JSON)</label>
          <textarea
            id="extra_meta"
            name="extra_meta"
            value={JSON.stringify(formData.extra_meta, null, 2)}
            onChange={handleMetaChange}
            placeholder="{}"
            rows={5}
          />
        </div>

        {/* Save & Cancel buttons at the bottom - only shown when needed */}
        <div
          className={styles.formActions}
          style={{ display: !responseData ? 'flex' : 'none' }}
        >
          <button
            type="button"
            onClick={onCancel}
            className={styles.cancelButton}
            disabled={isLoading || isTestRunning}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={saveApiDefinition}
            className={styles.saveButton}
            disabled={isLoading || isTestRunning}
          >
            {isLoading ? 'Saving...' : apiId ? 'Update API' : 'Save API'}
          </button>
        </div>
      </form>
      {/* Response section - always visible */}
      <div className={styles.responseSection}>
        <h3>Response</h3>

        {responseData ? (
          <div className={styles.responseHeader}>
            <div
              className={`${styles.statusBadge} ${
                responseData.status >= 200 && responseData.status < 300
                  ? styles.statusSuccess
                  : responseData.status >= 400
                    ? styles.statusError
                    : styles.statusWarning
              }`}
            >
              {responseData.status} {responseData.statusText}
            </div>

            {responseData.duration && (
              <div className={styles.responseMeta}>
                Time: {responseData.duration}ms
              </div>
            )}

            <div className={styles.responseActions}>
              <button
                className={styles.secondaryButton}
                onClick={() => setResponseData(null)}
              >
                Clear
              </button>
              <button
                className={styles.secondaryButton}
                onClick={saveApiDefinition}
              >
                Save API
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.emptyResponseHeader}>
            No response data yet. Send a request to see results.
          </div>
        )}

        <div className={styles.responseTabs}>
          <div className={`${styles.responseTab} ${styles.activeResponseTab}`}>
            Body
          </div>
          <div className={styles.responseTab}>Headers</div>
          <div className={styles.responseTab}>Cookies</div>
        </div>

        <div className={styles.responseBody}>
          {isTestRunning ? (
            <div className={styles.loading}>Sending request...</div>
          ) : responseData ? (
            <pre>
              {JSON.stringify(
                responseData.data || responseData.error || {},
                null,
                2
              )}
            </pre>
          ) : (
            <div className={styles.emptyResponse}>
              Send a request to see the response
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApiForm;
