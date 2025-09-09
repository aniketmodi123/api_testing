import { useEffect, useState } from 'react';
import { headerService } from '../../services/headerService';
import { useApi } from '../../store/api';
import { Button, JsonEditor } from '../common';
import styles from './ApiForm.module.css';

// Utility function to check if URL is an ngrok URL and add required headers
const addNgrokHeadersIfNeeded = (url, existingHeaders = {}) => {
  const isNgrokUrl =
    url && (url.includes('.ngrok.') || url.includes('ngrok-free.app'));

  if (isNgrokUrl) {
    const enhancedHeaders = {
      ...existingHeaders,
      'ngrok-skip-browser-warning': 'true',
      'User-Agent': 'API-Testing-Tool/1.0',
      ...existingHeaders, // Keep user's headers last to allow overrides
    };

    // Debug logging

    return enhancedHeaders;
  }

  return existingHeaders;
};

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
const CopyButton = ({ textToCopy }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(textToCopy);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
    }
  };

  return (
    <Button
      variant="secondary"
      size="small"
      onClick={handleCopy}
      title="Copy to clipboard"
      className={styles.copyButton}
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
    </Button>
  );
};

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
          // For existing APIs, we need to use fileId which is actually the same as apiId in this context
          // The getApi function expects a fileId, not an apiId
          await getApi(apiId, true); // Include cases for comprehensive data
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
      // Extract validation data if available
      const validationData = activeApi.validation || {
        requestSchema: {},
        responseSchema: {},
        rules: [],
      };

      setFormData({
        name: activeApi.name || '',
        method: activeApi.method || 'GET',
        endpoint: activeApi.endpoint || '',
        description: activeApi.description || '',
        is_active: activeApi.is_active ?? true,
        headers: activeApi.headers || {},
        params: activeApi.params || {},
        request_body: activeApi.request_body || {},
        validation: validationData,
        expected: {
          status: activeApi.expected?.status || 200,
          headers: activeApi.expected?.headers || {},
          body: activeApi.expected?.body || {},
        },
        extra_meta: activeApi.extra_meta || {},
      });
    }
  }, [activeApi, apiId]);

  // Auto-detect ngrok URLs and suggest adding headers
  useEffect(() => {
    const isNgrokUrl =
      formData.endpoint &&
      (formData.endpoint.includes('.ngrok.') ||
        formData.endpoint.includes('ngrok-free.app'));

    if (isNgrokUrl && !formData.headers['ngrok-skip-browser-warning']) {
      // Suggest adding ngrok headers
      console.log(
        '🔗 Ngrok URL detected! Auto-adding bypass headers for:',
        formData.endpoint
      );

      setFormData(prev => ({
        ...prev,
        headers: {
          ...prev.headers,
          'ngrok-skip-browser-warning': 'true',
          'User-Agent': prev.headers['User-Agent'] || 'API-Testing-Tool/1.0',
        },
      }));
    }
  }, [formData.endpoint]);

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
      // Check if this is an ngrok URL
      const isNgrokUrl =
        formData.endpoint &&
        (formData.endpoint.includes('.ngrok.') ||
          formData.endpoint.includes('ngrok-free.app'));

      // Automatically add ngrok headers if needed
      const enhancedHeaders = addNgrokHeadersIfNeeded(
        formData.endpoint,
        formData.headers
      );

      console.log('🚀 Making API call:', {
        url: formData.endpoint,
        method: formData.method,
        headers: enhancedHeaders,
        isNgrokUrl,
      });

      if (isNgrokUrl) {
        // Make direct API call from frontend for ngrok URLs
        console.log('🔗 Making direct frontend call to ngrok URL');

        // First, fetch headers from backend for this API's folder
        let backendHeaders = {};
        if (fileId) {
          try {
            console.log('📡 Fetching headers from backend for fileId:', fileId);
            const headersResponse = await headerService.getHeaders(fileId);
            backendHeaders = headersResponse?.data?.content || {};
            console.log(
              '📋 Backend headers fetched successfully:',
              backendHeaders
            );

            if (Object.keys(backendHeaders).length === 0) {
              console.log('ℹ️ No backend headers found for this API');
            }
          } catch (headerError) {
            console.warn('⚠️ Could not fetch backend headers:', headerError);
            console.log(
              'Will proceed with form headers and ngrok headers only'
            );
          }
        } else {
          console.log('⚠️ No fileId available, skipping backend header fetch');
        }

        // Merge backend headers with form headers and ngrok headers
        // Priority: ngrok headers > form headers > backend headers
        console.log('🔧 Merging headers with priority order:');
        console.log('  1️⃣ Backend headers (lowest priority):', backendHeaders);
        console.log('  2️⃣ Form headers (medium priority):', formData.headers);

        const ngrokHeaders = addNgrokHeadersIfNeeded(formData.endpoint, {});
        console.log('  3️⃣ Ngrok headers (highest priority):', ngrokHeaders);

        const mergedHeaders = {
          'Content-Type': 'application/json',
          ...backendHeaders, // Backend API-level headers (lowest priority)
          ...formData.headers, // Form headers (medium priority)
          ...ngrokHeaders, // Ngrok headers (highest priority)
        };

        console.log('🎯 Final merged headers for direct call:', mergedHeaders);
        console.log(
          '📊 Total header count:',
          Object.keys(mergedHeaders).length
        );

        const requestConfig = {
          method: formData.method,
          headers: mergedHeaders,
        };

        // Add query parameters
        let url = formData.endpoint;
        const searchParams = new URLSearchParams();

        // Always add ngrok bypass as query param for ngrok URLs (avoids CORS preflight)
        if (isNgrokUrl) {
          searchParams.append('ngrok-skip-browser-warning', 'true');
        }

        // Add user's query parameters
        if (formData.params && Object.keys(formData.params).length > 0) {
          Object.entries(formData.params).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
              searchParams.append(key, value);
            }
          });
        }

        // Append query parameters to URL
        const queryString = searchParams.toString();
        if (queryString) {
          url += (url.includes('?') ? '&' : '?') + queryString;
        }

        // Add body for non-GET requests
        if (formData.method !== 'GET' && formData.request_body) {
          try {
            requestConfig.body =
              typeof formData.request_body === 'string'
                ? formData.request_body
                : JSON.stringify(formData.request_body);
          } catch (e) {
            requestConfig.body = formData.request_body;
          }
        }

        const startTime = Date.now();

        // Log the actual request being sent
        console.log('🚀 About to send fetch request:');
        console.log('  📍 URL:', url);
        console.log('  🔧 Method:', requestConfig.method);
        console.log('  📋 Headers being sent:', requestConfig.headers);
        console.log('  📦 Body:', requestConfig.body || 'No body');

        const response = await fetch(url, requestConfig);
        const duration = Date.now() - startTime;

        const responseText = await response.text();
        let responseData;
        try {
          responseData = JSON.parse(responseText);
        } catch (e) {
          responseData = responseText;
        }

        const apiResponse = {
          status: response.status,
          statusText: response.statusText,
          data: responseData,
          headers: Object.fromEntries(response.headers.entries()),
          config: requestConfig,
          duration: duration,
        };

        // For direct API calls, don't redirect on 401 - just show the response
        if (response.status === 401) {
          console.log(
            '🔒 Direct API call returned 401 (External API authorization required):',
            apiResponse
          );
        } else {
          console.log('✅ Direct API call successful:', apiResponse);
        }

        setResponseData(apiResponse);
        setIsTestRunning(false);

        // For direct API calls, save definition in background without affecting the test result
        // Wrap in try-catch to prevent backend auth issues from affecting the direct API call
        setTimeout(async () => {
          try {
            await saveApiDefinition();
          } catch (err) {
            console.log(
              '⚠️ Could not save API definition (backend auth issue):',
              err.message
            );
            // Don't throw error or trigger redirects for direct API calls
          }
        }, 100);
      } else {
        // Use backend for non-ngrok URLs (existing logic)
        const requestData = {
          method: formData.method,
          url: formData.endpoint,
          headers: enhancedHeaders,
          params: formData.params,
          data: formData.method !== 'GET' ? formData.request_body : undefined,
        };

        // Simulate a response (replace with actual backend call if needed)
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
            duration: Math.floor(Math.random() * 500) + 100,
          };

          setResponseData(mockResponse);
          setIsTestRunning(false);
          saveApiDefinition();
        }, 800);
      }
    } catch (err) {
      console.error('❌ Error executing API:', err);
      setIsTestRunning(false);

      // Check if this was a direct API call vs backend call
      const isNgrokUrl =
        formData.endpoint &&
        (formData.endpoint.includes('.ngrok.') ||
          formData.endpoint.includes('ngrok-free.app'));

      // For direct API calls (ngrok), don't trigger auth redirects
      if (isNgrokUrl) {
        console.log(
          '🔗 Direct API call error (no auth redirect triggered):',
          err
        );

        // For direct API call errors, don't try to save to backend
        setResponseData({
          status: err.status || 500,
          statusText: err.statusText || 'Error',
          error: err.message || 'Network error occurred',
          data: err.response?.data || null,
        });
        return; // Early return to prevent any backend calls
      }

      // Set error response for backend calls
      setResponseData({
        status: err.status || 500,
        statusText: err.statusText || 'Error',
        error: err.message || 'Network error occurred',
        data: err.response?.data || null,
      });
    }
  };

  // Save API definition without testing
  const saveApiDefinition = async () => {
    try {
      let result;

      // Automatically add ngrok headers if endpoint is an ngrok URL
      const enhancedFormData = {
        ...formData,
        headers: addNgrokHeadersIfNeeded(formData.endpoint, formData.headers),
      };

      console.log('💾 Saving API definition:');
      console.log('📍 Endpoint:', enhancedFormData.endpoint);
      console.log('📋 Headers being saved:', enhancedFormData.headers);
      console.log('🔧 Full API data:', enhancedFormData);

      if (apiId) {
        // Update existing API
        result = await updateApi(apiId, enhancedFormData);
      } else {
        // Create new API
        result = await createApi(fileId, enhancedFormData);
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
          headers: addNgrokHeadersIfNeeded(formData.endpoint, formData.headers),
          params: formData.params,
          request_body: formData.request_body,
          authorization: formData.authorization,
        };

        await updateApi(apiId, configOnlyData);
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
      // Automatically add ngrok headers if needed
      const enhancedHeaders = addNgrokHeadersIfNeeded(
        formData.endpoint,
        formData.headers
      );

      const testCase = {
        api_id: apiId,
        name: `Test case - ${new Date().toLocaleTimeString()}`,
        request: {
          method: formData.method,
          endpoint: formData.endpoint,
          headers: enhancedHeaders,
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

        {/* Ngrok detection indicator */}
        {formData.endpoint &&
          (formData.endpoint.includes('.ngrok.') ||
            formData.endpoint.includes('ngrok-free.app')) && (
            <div
              style={{
                padding: '4px 8px',
                backgroundColor: '#e3f2fd',
                border: '1px solid #2196f3',
                borderRadius: '4px',
                fontSize: '12px',
                color: '#1976d2',
                marginLeft: '8px',
                whiteSpace: 'nowrap',
              }}
            >
              🔗 Ngrok detected - bypass headers added
            </div>
          )}

        <Button variant="primary" onClick={handleSubmit} disabled={isLoading}>
          {isLoading ? 'Sending...' : 'Send'}
        </Button>

        <Button
          variant="secondary"
          onClick={saveApiDefinition}
          disabled={isLoading}
        >
          Save
        </Button>

        <Button
          variant="secondary"
          onClick={saveRequestConfig}
          disabled={isLoading}
          title="Update request configuration (params, headers, body)"
        >
          Update Config
        </Button>

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
              <Button
                variant="danger"
                size="small"
                className={styles.removeButton}
                onClick={() => handleRemove('headers', key)}
              >
                ✕
              </Button>
            </div>
          ))}
          <Button
            variant="primary"
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
          </Button>

          <div className={`${styles.jsonEditor} scrollable`}>
            <label htmlFor="headers_json">Headers as JSON:</label>
            <JsonEditor
              value={JSON.stringify(formData.headers, null, 2)}
              onChange={value =>
                handleJsonChange('headers', { target: { value } })
              }
              placeholder="{}"
              minHeight={120}
              showCopyButton={true}
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
              <Button
                variant="danger"
                size="small"
                className={styles.removeButton}
                onClick={() => handleRemove('params', key)}
              >
                ✕
              </Button>
            </div>
          ))}
          <Button
            variant="primary"
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
          </Button>

          <div className={styles.jsonEditor}>
            <label htmlFor="params_json">Parameters as JSON:</label>
            <JsonEditor
              value={JSON.stringify(formData.params, null, 2)}
              onChange={value =>
                handleJsonChange('params', { target: { value } })
              }
              placeholder="{}"
              minHeight={120}
              showCopyButton={true}
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
            <JsonEditor
              value={JSON.stringify(formData.request_body, null, 2)}
              onChange={value =>
                handleJsonChange('request_body', { target: { value } })
              }
              placeholder="{}"
              minHeight={300}
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
              <JsonEditor
                value={JSON.stringify(
                  formData.validation.requestSchema,
                  null,
                  2
                )}
                onChange={value => {
                  try {
                    const schema = value ? JSON.parse(value) : {};
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
                placeholder="Enter JSON schema for request validation"
                minHeight={160}
                showCopyButton={true}
              />
            </div>
          </div>

          <div className={styles.validationSection}>
            <h4>Response Schema</h4>
            <div className={styles.jsonEditor}>
              <JsonEditor
                value={JSON.stringify(
                  formData.validation.responseSchema,
                  null,
                  2
                )}
                onChange={value => {
                  try {
                    const schema = value ? JSON.parse(value) : {};
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
                placeholder="Enter JSON schema for response validation"
                minHeight={160}
              />
            </div>
          </div>

          <div className={styles.validationActions}>
            <Button
              variant="primary"
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
            </Button>
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
            <JsonEditor
              value={JSON.stringify(formData.expected?.headers || {}, null, 2)}
              onChange={value => {
                try {
                  const headersValue = value ? JSON.parse(value) : {};
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
              placeholder="{}"
              minHeight={120}
            />
          </div>

          <h4>Expected Body</h4>
          <div className={styles.jsonEditor}>
            <JsonEditor
              value={JSON.stringify(formData.expected?.body || {}, null, 2)}
              onChange={value => {
                try {
                  const bodyValue = value ? JSON.parse(value) : {};
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
              placeholder="{}"
              minHeight={200}
            />
          </div>
        </div>

        {/* Extra Metadata Tab - Can be shown in Basic tab or as a separate tab */}
        <div
          className={styles.formGroup}
          style={{ display: activeTab === 'basic' ? 'block' : 'none' }}
        >
          <label htmlFor="extra_meta">Extra Metadata (JSON)</label>
          <JsonEditor
            value={JSON.stringify(formData.extra_meta, null, 2)}
            onChange={value => handleMetaChange({ target: { value } })}
            placeholder="{}"
            minHeight={120}
          />
        </div>

        {/* Save & Cancel buttons at the bottom - only shown when needed */}
        <div
          className={styles.formActions}
          style={{ display: !responseData ? 'flex' : 'none' }}
        >
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={isLoading || isTestRunning}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={saveApiDefinition}
            disabled={isLoading || isTestRunning}
          >
            {isLoading ? 'Saving...' : apiId ? 'Update API' : 'Save API'}
          </Button>
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
              <Button variant="secondary" onClick={() => setResponseData(null)}>
                Clear
              </Button>
              <Button variant="secondary" onClick={saveApiDefinition}>
                Save API
              </Button>
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
