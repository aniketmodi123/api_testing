import { useCallback, useEffect, useState } from 'react';
import { parseCurl } from '../../utils/importExport';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';
import CodeMirror from '@uiw/react-codemirror';
import { json as jsonLang } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import thinkingGif from '../../assets/think_emoji.gif';
import { BackendApiCallService } from '../../services/backendApiCallService';
import { useApi } from '../../store/api';
import { useEnvironment } from '../../store/environment';
import { useNode } from '../../store/node';
import { useWorkspace } from '../../store/workspace';
import { useTheme } from '../ThemeContext.jsx';
import { TestCaseForm } from '../TestCaseForm';
import TestResultsGrid from '../TestResultsGrid';
import { Button, JsonEditor, VariableInput, VariableAwareInput } from '../common';
import WebSocketPanel from '../WebSocketPanel/WebSocketPanel';
import EnvironmentSwitcher from '../EnvironmentSwitcher';
import AuthBuilder from './AuthBuilder';
import CollectionVarEditor from '../CollectionVarEditor/CollectionVarEditor';
import { api as backendApi } from '../../api';
import styles from './RequestPanel.module.css';
import './buttonStyles.css';
import './dropdown.css';

async function saveHistory(payload) {
  try {
    await backendApi.post('/history', payload);
  } catch (err) {
    // History save failure is non-critical
    console.warn('Failed to save history:', err);
  }
}

// Utility function to check if URL is an ngrok URL and add required headers
const addNgrokHeadersIfNeeded = (url, existingHeaders = {}) => {
  const isNgrokUrl =
    url && (url.includes('.ngrok.') || url.includes('ngrok-free.app'));

  if (isNgrokUrl) {
    const enhancedHeaders = {
      ...existingHeaders,
      'ngrok-skip-browser-warning': 'true',
      'User-Agent': 'API-Testing-Tool/1.0', // Keep original logic even if browser blocks it
      ...existingHeaders, // Keep user's headers last to allow overrides
    };

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
function mapStatusToText(status) {
  if (!status) return 'N/A';
  const code = Number(status);
  const statusMap = {
    200: '200 OK',
    201: '201 Created',
    204: '204 No Content',
    400: '400 Bad Request',
    401: '401 Unauthorized',
    403: '403 Forbidden',
    404: '404 Not Found',
    406: '406 Not Acceptable',
    409: '409 Conflict',
    422: '422 Unprocessable Entity',
    500: '500 Internal Server Error',
    502: '502 Bad Gateway',
    503: '503 Service Unavailable',
    206: '206 No Data Found',
  };
  return statusMap[code] || code.toString();
}

// 🔹 Build cURL command from request
function buildCurlCommand(req) {
  if (!req || !req.url) return 'N/A';

  const method = req.method?.toUpperCase() || 'GET';
  const headers = req.headers
    ? Object.entries(req.headers)
        .map(([k, v]) => `-H "${k}: ${v}"`)
        .join(' \\\n  ')
    : '';

  const body =
    req.body && Object.keys(req.body).length
      ? `-H "Content-Type: application/json" \\\n  -d '${JSON.stringify(req.body)}'`
      : '';

  return `curl -X ${method} "${req.url}" \\\n  ${headers}${body ? ' \\\n  ' + body : ''}`;
}

// 🔹 Transform test results into simplified table
const transformTestResultsToExcel = testResults => {
  let resultsArray = [];

  if (Array.isArray(testResults)) {
    resultsArray = testResults;
  } else if (testResults?.test_cases) {
    resultsArray = testResults.test_cases;
  } else if (testResults?.data) {
    resultsArray = Array.isArray(testResults.data)
      ? testResults.data
      : [testResults.data];
  } else if (testResults) {
    resultsArray = [testResults];
  }

  return resultsArray.map((item, index) => {
    const testCaseName = item.case || item.name || `Test Case ${index + 1}`;
    const result = (item.ok ?? item.passed ?? item.success) ? 'Pass' : 'Fail';

    // --- Request as cURL ---
    const requestCurl = buildCurlCommand(item.request);

    // --- Expected ---
    const expected = item.request?.expected || item.expected || {};
    const expectedStatus = expected.status_in
      ? expected.status_in.map(s => mapStatusToText(s)).join(' or ')
      : expected.status
        ? mapStatusToText(expected.status)
        : 'N/A';

    // --- Response (formatted JSON) ---
    const response = item.response?.json
      ? JSON.stringify(item.response.json, null, 2)
      : item.response || 'N/A';

    return {
      'Test case name': testCaseName,
      Request: requestCurl,
      Expected: expectedStatus,
      Response: response,
      Result: result,
    };
  });
};

// 🔹 Copy structured table to clipboard (Confluence / Docs compatible)
async function copyTableToClipboard(excelData) {
  const headers = [
    'Test case name',
    'Request',
    'Expected',
    'Response',
    'Result',
  ];

  // Colors below are intentionally hardcoded — this HTML is copied to the OS
  // clipboard for pasting into Confluence/Docs, which has no access to our CSS vars.
  const htmlTable = `
  <table border="1" cellspacing="0" cellpadding="6" style="border-collapse: collapse; width: 100%; border: 1px solid #ccc;">
    <thead style="background-color: #f3f3f3; font-weight: bold;">
      <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
    </thead>
    <tbody>
      ${excelData
        .map(row => {
          const color = row.Result === 'Pass' ? '#09ee09ff' : '#fbeaea';
          return `<tr style="background-color: ${color}; vertical-align: top;">
            ${headers
              .map(h => {
                let value = row[h] || '';
                if (h === 'Response') {
                  // Preserve indentation & line breaks
                  value = `<pre style="white-space: pre-wrap; font-family: monospace;">${value}</pre>`;
                }
                return `<td style="vertical-align: top;">${value}</td>`;
              })
              .join('')}
          </tr>`;
        })
        .join('')}
    </tbody>
  </table>`;

  await navigator.clipboard.write([
    new ClipboardItem({
      'text/html': new Blob([htmlTable], { type: 'text/html' }),
      'text/plain': new Blob([htmlTable], { type: 'text/plain' }),
    }),
  ]);

  console.log(
    '✅ Table copied with pretty JSON + cURL! Paste directly into Confluence or Docs.'
  );
}

// Reusable copy button component
const CopyButton = ({ textToCopy, className, label }) => {
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
      className={className || ''}
      onClick={handleCopy}
      title={label || 'Copy to clipboard'}
    >
      {label ? (
        copied ? '✓ Copied' : label
      ) : copied ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" fill="currentColor" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z" fill="currentColor" />
        </svg>
      )}
    </Button>
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

function normalizeBody(bodyContent, bodyType, gqlOpts = null) {
  if (bodyType === 'none') return null;
  if (bodyType === 'graphql' && gqlOpts) {
    let variables = {};
    try { variables = JSON.parse(gqlOpts.variables || '{}'); } catch {}
    return JSON.stringify({ query: gqlOpts.query || '', variables });
  }
  return bodyContent;
}

// Reusable key-value table for form-data and url-encoded bodies
function KeyValueBodyTable({ rows, setRows, onSerialize }) {
  const serialize = updatedRows => {
    const params = new URLSearchParams();
    updatedRows.forEach(r => { if (r.key) params.append(r.key, r.value); });
    onSerialize(params.toString());
  };

  const updateRow = (idx, field, val) => {
    const next = rows.map((r, i) => i === idx ? { ...r, [field]: val } : r);
    setRows(next);
    serialize(next);
  };

  const addRow = () => {
    const next = [...rows, { key: '', value: '' }];
    setRows(next);
  };

  const removeRow = idx => {
    const next = rows.filter((_, i) => i !== idx);
    setRows(next.length ? next : [{ key: '', value: '' }]);
    serialize(next);
  };

  return (
    <div className="kvTable">
      {rows.map((row, idx) => (
        <div key={idx} className="kvRow">
          <input
            type="text"
            value={row.key}
            onChange={e => updateRow(idx, 'key', e.target.value)}
            placeholder="Key"
            className="kvInput"
          />
          <input
            type="text"
            value={row.value}
            onChange={e => updateRow(idx, 'value', e.target.value)}
            placeholder="Value"
            className="kvInput"
          />
          <button className="kvRemove" onClick={() => removeRow(idx)}>×</button>
        </div>
      ))}
      <button className="kvAdd" onClick={addRow}>+ Add row</button>
    </div>
  );
}

export default function RequestPanel({ activeRequest, onMethodChange }) {
  const { selectedNode, getNodeById } = useNode();
  const { variables, activeEnvironment } = useEnvironment();
  const { isDarkMode } = useTheme();
  const { activeWorkspace } = useWorkspace();
  const {
    getApi,
    refreshApi,
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
    deleteTestCase,
    bulkDeleteTestCases,
    isFromCache,
  } = useApi();

  const [method, setMethod] = useState(
    activeRequest?.method || selectedNode?.method || 'GET'
  );
  const [url, setUrl] = useState(
    activeRequest?.url || selectedNode?.url || selectedNode?.endpoint || ''
  );

  // Wrap setters to mark panel dirty when user edits anything
  const setMethodDirty = v => { setMethod(v); setIsDirty(true); };
  const setUrlDirty = v => { setUrl(v); setIsDirty(true); };
  const setHeadersDirty = v => { setHeaders(v); setIsDirty(true); };
  const setParamsDirty = v => { setParams(v); setIsDirty(true); };
  const setBodyContentDirty = v => { setBodyContent(v); setIsDirty(true); };
  const setBodyTypeDirty = v => { setBodyType(v); setIsDirty(true); };
  const [isUpdatingConfig, setIsUpdatingConfig] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showTestCaseForm, setShowTestCaseForm] = useState(false);
  const [editingTestCaseId, setEditingTestCaseId] = useState(null);
  const [bodyContent, setBodyContent] = useState('');
  const [bodyType, setBodyType] = useState('JSON');
  const [validationSchema, setValidationSchema] = useState('');
  // Form-data and url-encoded rows for Phase 1 key-value table UI
  const [formDataRows, setFormDataRows] = useState([{ key: '', value: '' }]);
  const [urlEncodedRows, setUrlEncodedRows] = useState([{ key: '', value: '' }]);
  // GraphQL state (Phase 7a)
  const [gqlQuery, setGqlQuery] = useState('');
  const [gqlVariables, setGqlVariables] = useState('{}');
  const [gqlSchemaLoading, setGqlSchemaLoading] = useState(false);
  const [gqlSchemaError, setGqlSchemaError] = useState(null);
  // requestHeight removed — vertical resize handled by react-resizable-panels in Home layout

  // Local cache for folder headers to avoid repeated backend calls
  const [folderHeadersCache, setFolderHeadersCache] = useState(new Map());

  // State for parameters
  const [params, setParams] = useState([]);

  // State for headers
  const [headers, setHeaders] = useState([]);

  // Function to get folder headers with caching
  const getFolderHeaders = async headerNodeId => {
    if (!headerNodeId) return {};

    // Check cache first
    if (folderHeadersCache.has(headerNodeId)) {
      return folderHeadersCache.get(headerNodeId);
    }

    try {
      const headersResponse = await headerService.getHeaders(headerNodeId);
      const headers = headersResponse?.data?.content || {};

      // Cache the result
      setFolderHeadersCache(prev => new Map(prev.set(headerNodeId, headers)));

      return headers;
    } catch (error) {
      console.warn('⚠️ Could not fetch headers for node:', headerNodeId, error);
      // Cache empty result to avoid repeated failed requests
      setFolderHeadersCache(prev => new Map(prev.set(headerNodeId, {})));
      return {};
    }
  };

  // State for detailed test result modal
  const [showDetailedResult, setShowDetailedResult] = useState(false);
  const [selectedTestResult, setSelectedTestResult] = useState(null);
  const [editingApiInModal, setEditingApiInModal] = useState(false);
  const [modalApiData, setModalApiData] = useState(null);

  // Vertical resize is now handled by react-resizable-panels — startResize removed

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

      // Set default body content after determining type
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

      // Initialize validation schema
      const schema =
        extractValue(activeApi, 'extra_meta.expected') ||
        extractValue(activeApi, 'expected') ||
        extractValue(activeApi, 'validation.responseSchema') ||
        extractValue(activeApi, 'validationSchema.response') ||
        defaultValidationSchema;

      if (schema) {
        setValidationSchema(
          typeof schema === 'string' ? schema : JSON.stringify(schema, null, 2)
        );
      } else {
        setValidationSchema(JSON.stringify(defaultValidationSchema, null, 2));
      }

      // Initialize params from activeApi
      const apiParams = extractValue(activeApi, 'params', {});
      if (Array.isArray(apiParams)) {
        setParams(apiParams);
      } else if (typeof apiParams === 'object') {
        setParams(
          Object.entries(apiParams).map(([key, value]) => ({
            key,
            value,
            description: '',
          }))
        );
      } else {
        setParams([]);
      }

      // Initialize headers from activeApi
      const apiHeaders = extractValue(activeApi, 'headers', {});
      if (Array.isArray(apiHeaders)) {
        setHeaders(apiHeaders);
      } else if (typeof apiHeaders === 'object' && apiHeaders !== null) {
        setHeaders(
          Object.entries(apiHeaders).map(([key, value]) => ({
            key,
            value,
            description: key === 'Content-Type' ? 'Content type header' : '',
          }))
        );
      } else {
        setHeaders([]);
      }
    } else {
      // No active API, set defaults
      setBodyType('none');
      setBodyContent('');
      setValidationSchema(JSON.stringify(defaultValidationSchema, null, 2));
    }
  }, [activeApi]);

  useEffect(() => {
    if (selectedNode) {
      setMethod(selectedNode.method || 'GET');
      setIsDirty(false);

      // Clear test results when switching files
      clearTestResults();

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
            ('API data loaded:', apiResponse);

            // Check if we got a 206 status (no API data)
            if (apiResponse.status === 206) {
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
          .then(testCasesResponse => {})
          .catch(err => console.error('Error loading test cases:', err));
      }
    }
  }, [selectedNode, getApi, getTestCases, clearTestResults]);

  const [activeTab, setActiveTab] = useState('api');
  const [responseTab, setResponseTab] = useState('body');
  const [response, setResponse] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [requestTimeout, setRequestTimeout] = useState(30);
  const [excelCopied, setExcelCopied] = useState(false);
  const [selectedTestCases, setSelectedTestCases] = useState([]);
  const [defaultValidationSchema, setDefaultValidationSchema] = useState({
    status: 200,
    text_contains: '',
    text_contains_any: [],
    text_regex: '',
    headers: {},
    headers_regex: {},
    json: {
      checks: [
        { path: '', equals: null },
        { path: '', present: true },
        { path: '', absent: true },
        { path: '', type: 'string' },
        { path: '', regex: '' },
        { path: '', contains: '' },
        { path: '', length: 0 },
        { path: '', gt: 0 },
        { path: '', gte: 0 },
        { path: '', lt: 0 },
        { path: '', lte: 0 },
      ],
      either: [
        { checks: [{ path: '', present: true }] },
        { checks: [{ path: '', present: true }] },
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

    // Debug logging to check selectedNode

    if (!selectedNode?.id) {
      console.error('No selected node or node ID available for running tests');
      return;
    }

    setIsSending(true);
    try {
      const result = await runTest(selectedNode.id, selectedTestCases);
      setActiveTab('apiTests');
    } catch (error) {
      console.error('Error running selected tests:', error);
    } finally {
      setIsSending(false);
    }
  };

  // Function to run a single test from the test result card
  const handleRunSingleTest = async testResult => {
    if (!selectedNode?.id) {
      console.error('No selected node or node ID available for running test');
      return;
    }

    setIsSending(true);
    try {
      // Extract test case ID from the test result
      const testCaseId = testResult.id || testResult.case_id;
      if (testCaseId) {
        await runTest(selectedNode.id, [testCaseId]);
      } else {
        // If no specific test case ID, run all tests
        await runTest(selectedNode.id);
      }
      setActiveTab('apiTests');
    } catch (error) {
      console.error('Error running single test:', error);
    } finally {
      setIsSending(false);
    }
  };

  // Function to delete all or selected test cases
  const handleDeleteTestCases = async () => {
    if (!selectedNode?.id || !testCases || testCases.length === 0) {
      return;
    }

    // Determine which cases to delete
    const casesToDelete =
      selectedTestCases.length > 0
        ? selectedTestCases
        : testCases.map(tc => tc.id || tc.case_id);

    const count = casesToDelete.length;
    const message =
      selectedTestCases.length > 0
        ? `Are you sure you want to delete ${count} selected test case${count > 1 ? 's' : ''}?`
        : `Are you sure you want to delete all ${count} test case${count > 1 ? 's' : ''}?`;

    const confirmDelete = window.confirm(message);
    if (!confirmDelete) return;

    try {
      await bulkDeleteTestCases(casesToDelete);
      // Clear selected test cases after deletion
      setSelectedTestCases([]);
      // Refresh test cases list
      await getTestCases(selectedNode.id);
    } catch (error) {
      console.error('Error deleting test cases:', error);
      alert(`Failed to delete test cases: ${error.message || 'Unknown error'}`);
    }
  };

  // Function to directly call the API with current parameters
  const handleDirectApiCall = useCallback(async () => {
    setIsSending(true);
    try {
      // Build params and headers from live UI state — not from saved DB copy
      const paramsObj = {};
      params.forEach(p => { if (p.key) paramsObj[p.key] = p.value; });

      const headersObj = {};
      headers.forEach(h => { if (h.key) headersObj[h.key] = h.value; });

      const response = await BackendApiCallService.executeApiCall({
        fileId: selectedNode?.id ?? null,
        environmentId: activeEnvironment?.id ?? null,
        method: method,
        url: url,
        headers: headersObj,
        params: paramsObj,
        body: method !== 'GET' ? normalizeBody(bodyContent, bodyType, bodyType === 'graphql' ? { query: gqlQuery, variables: gqlVariables } : null) : null,
        bodyType: bodyType,
        options: { timeout: requestTimeout },
      });

      // Format response for display to match UI expectations
      const formattedResponse = {
        status: response.data?.status_code || 200,
        statusText: response.data?.status_code < 300 ? 'OK' : 'Error',
        time: `${response.data?.execution_time || 0}ms`,
        size: response.data?.text
          ? `${new Blob([response.data.text]).size} bytes`
          : '0 bytes',
        headers: response.data?.headers || {},
        body: response.data?.json || response.data?.text || '',
        // Keep additional data for reference
        raw_response: response.data,
        resolved_url: response.data?.resolved_url || url,
        variables_used: response.data?.variables_used || {},
        folder_headers: response.data?.folder_headers || {},
      };

      setResponse(formattedResponse);
      setResponseTab('body');

      // Auto-save history (fire-and-forget)
      saveHistory({
        file_id: selectedNode?.id ?? null,
        workspace_id: activeWorkspace?.id ?? null,
        method,
        url,
        headers: extractValue(activeApi, 'headers', {}),
        params: paramsObj,
        body: method !== 'GET' ? normalizeBody(bodyContent, bodyType, bodyType === 'graphql' ? { query: gqlQuery, variables: gqlVariables } : null) : null,
        response_status: formattedResponse.status,
        response_body:
          typeof formattedResponse.body === 'object'
            ? JSON.stringify(formattedResponse.body)
            : String(formattedResponse.body ?? ''),
        response_headers: formattedResponse.headers,
        execution_time_ms: response.data?.execution_time ?? 0,
      });
    } catch (error) {
      console.error('❌ Error executing API via backend:', error);

      // Format error response to match UI expectations
      setResponse({
        status: error.response?.status || 500,
        statusText: error.response?.statusText || 'Error',
        time: 'Error',
        size: '0 bytes',
        headers: {},
        body: error.message || 'Backend API execution failed',
        isError: true,
      });

      setResponseTab('body');
    } finally {
      setIsSending(false);
    }
  }, [selectedNode, activeEnvironment, method, url, headers, params, bodyContent, bodyType, gqlQuery, gqlVariables, requestTimeout]);

  // Cmd+Enter (Mac) / Ctrl+Enter (Win) fires Send
  useEffect(() => {
    const onKeyDown = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!isSending && url) handleDirectApiCall();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isSending, url, handleDirectApiCall]);

  // Function to validate the API using backend validation endpoint
  const handleValidateApi = async () => {
    setIsSending(true);
    try {
      // Prepare params from state
      const paramsObj = {};
      params.forEach(p => {
        if (p.key) paramsObj[p.key] = p.value;
      });

      if (!selectedNode?.id) {
        throw new Error(
          'No API selected. Please select or create an API first.'
        );
      }

      // Get the validation schema from API or use default
      const validationSchema =
        extractValue(activeApi, 'extra_meta.expected') ||
        extractValue(activeApi, 'expected') ||
        extractValue(activeApi, 'validation.responseSchema') ||
        extractValue(activeApi, 'validationSchema.response') ||
        defaultValidationSchema;

      const headersObj = {};
      headers.forEach(h => { if (h.key) headersObj[h.key] = h.value; });

      const validationResponse =
        await BackendApiCallService.executeWithValidation({
          fileId: selectedNode?.id ?? null,
          environmentId: activeEnvironment?.id ?? null,
          method: method,
          url: url,
          headers: headersObj,
          params: paramsObj,
          body: method !== 'GET' ? normalizeBody(bodyContent, bodyType, bodyType === 'graphql' ? { query: gqlQuery, variables: gqlVariables } : null) : null,
          expected: validationSchema,
          options: { timeout: requestTimeout },
        });

      // Format response for display with validation results
      const formattedResponse = {
        status: validationResponse.data?.status_code || 200,
        statusText: validationResponse.data?.status_code < 300 ? 'OK' : 'Error',
        time: `${validationResponse.data?.execution_time || 0}ms`,
        size: validationResponse.data?.text
          ? `${new Blob([validationResponse.data.text]).size} bytes`
          : '0 bytes',
        headers: validationResponse.data?.headers || {},
        body: {
          ...(validationResponse.data?.json ||
            validationResponse.data?.text ||
            ''),
          validation: validationResponse.data?.validation || null,
        },
        raw_response: validationResponse.data,
        resolved_url: validationResponse.data?.resolved_url || url,
        variables_used: validationResponse.data?.variables_used || {},
        folder_headers: validationResponse.data?.folder_headers || {},
      };

      setResponse(formattedResponse);
      setResponseTab('body');
    } catch (error) {
      console.error('Error validating API:', error);

      setResponse({
        status: 500,
        statusText: 'Validation Error',
        time: 'Error',
        size: '0 bytes',
        headers: {},
        body: {
          message: 'Failed to validate API',
          details: error.message,
        },
        isError: true,
      });

      setResponseTab('body');
    } finally {
      setIsSending(false);
    }
  };

  // Save the current request config as an API (create or update)
  const handleSaveApiConfig = async () => {
    if (!selectedNode?.id) {
      alert('Please select a file first');
      return;
    }

    setIsUpdatingConfig(true);

    try {
      // Parse validation schema if available
      let validationSchemaData;
      try {
        if (validationSchema && validationSchema.trim()) {
          validationSchemaData = JSON.parse(validationSchema);
        } else {
          // Get schema from active API or use default
          validationSchemaData =
            extractValue(activeApi, 'extra_meta.expected') ||
            extractValue(activeApi, 'expected') ||
            extractValue(activeApi, 'validation.responseSchema') ||
            extractValue(activeApi, 'validationSchema.response') ||
            defaultValidationSchema;
        }
      } catch (e) {
        console.warn('Invalid validation schema JSON, using default:', e);
        validationSchemaData = defaultValidationSchema;
      }

      // Prepare data for saving API (works for both create and update)
      const paramsObj = {};
      params.forEach(p => {
        if (p.key) paramsObj[p.key] = p.value;
      });

      // Convert headers array to object
      const headersObj = {};
      headers.forEach(h => {
        if (h.key) headersObj[h.key] = h.value;
      });

      const apiData = activeApi
        ? {
            // Update existing API
            ...activeApi,
            method: method,
            endpoint: url,
            headers: headersObj,
            params: paramsObj,
            body: normalizeBody(bodyContent, bodyType, bodyType === 'graphql' ? { query: gqlQuery, variables: gqlVariables } : null),
            bodyType: bodyType,
            extra_meta: {
              ...extractValue(activeApi, 'extra_meta', {}),
              headers: headersObj,
              params: paramsObj,
              body: normalizeBody(bodyContent, bodyType, bodyType === 'graphql' ? { query: gqlQuery, variables: gqlVariables } : null),
              expected: validationSchemaData,
            },
          }
        : {
            // Create new API
            name: selectedNode.name || 'New API',
            method: method,
            endpoint: url,
            description: '',
            is_active: true,
            headers: headersObj,
            params: paramsObj,
            body: normalizeBody(bodyContent, bodyType, bodyType === 'graphql' ? { query: gqlQuery, variables: gqlVariables } : null),
            bodyType: bodyType,
            extra_meta: {
              headers: headersObj,
              params: paramsObj,
              body: normalizeBody(bodyContent, bodyType, bodyType === 'graphql' ? { query: gqlQuery, variables: gqlVariables } : null),
              expected: validationSchemaData,
            },
          };

      // Use the unified saveApi function for both create and update
      await saveApi(selectedNode.id, apiData);

      // Reload the API details if this was a new API
      if (!activeApi) {
        await getApi(selectedNode.id);
      }
      setIsDirty(false);
    } catch (err) {
      console.error('Error saving API configuration:', err);
      alert(`Failed to save configuration: ${err.message}`);
    } finally {
      setIsUpdatingConfig(false);
    }
  };

  // Record the current request/response as a saved test case
  const handleRecordTestCase = async () => {
    if (!response) {
      alert('Send a request first to record as a test case');
      return;
    }

    // Start with button in saving state
    const button = document.querySelector('.saveActionsDropdown button');
    const originalText = button.innerText;
    button.innerText = 'Saving...';
    button.disabled = true;

    // Save the current request/response as a test case
    try {
      // Get the validation schema from the state
      let validationSchemaData;
      try {
        if (validationSchema && validationSchema.trim()) {
          validationSchemaData = JSON.parse(validationSchema);
        } else {
          // Get schema from active API or use default
          validationSchemaData =
            extractValue(activeApi, 'extra_meta.expected') ||
            extractValue(activeApi, 'expected') ||
            extractValue(activeApi, 'validation.responseSchema') ||
            extractValue(activeApi, 'validationSchema.response') ||
            defaultValidationSchema;
        }
      } catch (e) {
        console.warn('Failed to parse validation schema, using default', e);
        validationSchemaData = defaultValidationSchema;
      }

      // Ask user for a custom test case name
      const defaultName = `Test case - ${new Date().toLocaleTimeString()}`;
      const customName = prompt('Enter a name for this test case:', defaultName);

      // Get the request headers from the current request
      const requestHeaders = extractValue(activeApi, 'headers', {});

      const testCaseData = {
        name: customName || defaultName,
        headers: requestHeaders,
        body: bodyType === 'none' ? null : bodyContent,
        expected: validationSchemaData,
      };

      if (!selectedNode?.id) {
        console.error('Missing selectedNode.id when trying to save test case');
        alert('Error: No API selected. Please select an API first.');
        return;
      }

      try {
        const result = await saveTestCase(selectedNode.id, testCaseData);

        if (result && (result.data || result.success)) {
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
        alert(`Error saving test case: ${saveError.message || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error recording test case:', err);
      if (err.response) {
        console.error('Error response:', err.response.data);
        console.error('Status:', err.response.status);
      }
      alert(`Error saving test case: ${err.message || 'Unknown error'}`);
    } finally {
      button.innerText = originalText;
      button.disabled = false;
    }
  };


  // Handler functions for the detailed test result modal
  const handleOpenDetailedResult = testResult => {
    setSelectedTestResult(testResult);
    setShowDetailedResult(true);
    setEditingApiInModal(false);

    // Pre-populate API data for editing
    if (testResult.api) {
      setModalApiData({
        name: testResult.api.name || activeApi?.name || '',
        method: testResult.api.method || method,
        endpoint: testResult.api.endpoint || url,
        description: activeApi?.description || '',
        headers: testResult.request?.headers || {},
        body: testResult.request?.body || {},
        params: testResult.request?.params || {},
      });
    }
  };

  const handleCloseDetailedResult = () => {
    setShowDetailedResult(false);
    setSelectedTestResult(null);
    setEditingApiInModal(false);
    setModalApiData(null);
  };

  const handleEditApiInModal = () => {
    setEditingApiInModal(true);
  };

  const handleSaveApiFromModal = async () => {
    if (!modalApiData || !selectedNode?.id) return;

    try {
      setIsUpdatingConfig(true);
      const result = await saveApi(selectedNode.id, modalApiData);

      // Reload the API details
      await getApi(selectedNode.id);
      setEditingApiInModal(false);
    } catch (err) {
      console.error('Error saving API configuration:', err);
      alert(`Failed to save configuration: ${err.message}`);
    } finally {
      setIsUpdatingConfig(false);
    }
  };

  const handleRunTestFromModal = async () => {
    if (!selectedNode?.id || !selectedTestResult) return;

    try {
      setIsSending(true);
      const result = await runTest(selectedNode.id);

      // Update the selected test result with new data if available
      if (result && result.data && Array.isArray(result.data)) {
        const updatedResult = result.data.find(
          r =>
            r.case === selectedTestResult.case ||
            r.name === selectedTestResult.name
        );
        if (updatedResult) {
          setSelectedTestResult(updatedResult);
        }
      }
    } catch (err) {
      console.error('Error running test from modal:', err);
      alert(`Failed to run test: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveTestCaseFromCard = async (
    caseIdOrFileId,
    updatedDataOrPayload,
    maybeCaseId
  ) => {
    // This handler is called from multiple places and historically had two
    // possible call shapes:
    // 1) (caseId, updatedData)            -- used by card/modal callers
    // 2) (fileId, payload, caseId)        -- store-style callers
    // Be defensive and detect which shape we received.

    // Quick debug to help trace which signature gets used at runtime
    try {
      console.debug('handleSaveTestCaseFromCard called', {
        args: [caseIdOrFileId, updatedDataOrPayload, maybeCaseId],
        selectedNodeId: selectedNode?.id,
      });
    } catch (e) {
      // ignore
    }

    // If the second argument has a `.request` property, treat as (caseId, updatedData)
    let caseId = null;
    let updatedData = null;
    let fileId = selectedNode?.id;

    if (updatedDataOrPayload && updatedDataOrPayload.request !== undefined) {
      // signature: (caseId, updatedData)
      caseId = caseIdOrFileId;
      updatedData = updatedDataOrPayload;
    } else {
      // signature: (fileId, payload, caseId)
      fileId = caseIdOrFileId || selectedNode?.id;
      const payload = updatedDataOrPayload || {};
      caseId = maybeCaseId || payload.case_id || payload.id || null;

      // Transform payload into updatedData shape expected by card handlers
      updatedData = {
        request: {
          headers: payload.headers || {},
          params: payload.params || {},
          body: payload.body ?? null,
        },
        expected: payload.expected ?? null,
        name: payload.name,
      };
    }

    if (!fileId) return;

    try {
      // Normalize fileId if it's accidentally an object (defensive)
      let resolvedFileId = fileId;
      if (typeof resolvedFileId === 'object' && resolvedFileId !== null) {
        resolvedFileId =
          resolvedFileId.id ??
          resolvedFileId.file_id ??
          resolvedFileId._id ??
          null;
      }
      if (!resolvedFileId) {
        console.error('Invalid fileId when saving test case', { fileId });
        throw new Error('Invalid fileId for saving test case');
      }

      // Use the saveTestCase function from the store. If we have a fileId use it
      // (store-style); otherwise fall back to selectedNode.id. Keep name sensible.
      const result = await saveTestCase(
        resolvedFileId,
        {
          name:
            updatedData.name ||
            `Test case - ${caseId || new Date().toLocaleTimeString()}`,
          headers: updatedData.request?.headers || {},
          params: updatedData.request?.params || {},
          body: updatedData.request?.body || null,
          expected: updatedData.expected || null,
        },
        caseId
      );

      return result;
    } catch (error) {
      console.error('Error saving test case from card:', error);
      throw error;
    }
  };

  // Helper to build response body display value
  const responseBodyValue = response
    ? typeof response.body === 'object'
      ? JSON.stringify(response.body, null, 2)
      : String(response.body ?? '')
    : '';

  const handleUrlPaste = e => {
    const text = e.clipboardData?.getData('text') || '';
    if (!text.trimStart().toLowerCase().startsWith('curl ')) return;
    e.preventDefault();
    const parsed = parseCurl(text);
    if (!parsed) return;

    if (parsed.method) setMethodDirty(parsed.method);

    if (parsed.url) {
      try {
        const urlObj = new URL(parsed.url);
        setUrlDirty(parsed.url);
        const queryParams = [];
        urlObj.searchParams.forEach((value, key) => {
          queryParams.push({ key, value, description: '' });
        });
        if (queryParams.length) setParamsDirty(queryParams);
      } catch {
        setUrlDirty(parsed.url);
      }
    }

    const headerEntries = Object.entries(parsed.headers || {});
    if (headerEntries.length) {
      setHeadersDirty(headerEntries.map(([key, value]) => ({ key, value, description: '' })));
    }

    if (parsed.body != null) {
      const isObj = typeof parsed.body === 'object';
      const bodyStr = isObj ? JSON.stringify(parsed.body, null, 2) : parsed.body;
      try {
        JSON.parse(bodyStr);
        setBodyTypeDirty('JSON');
      } catch {
        setBodyTypeDirty('raw');
      }
      setBodyContentDirty(bodyStr);
    }
  };

  const isWebSocketUrl = url && (url.startsWith('ws://') || url.startsWith('wss://'));

  if (isWebSocketUrl) {
    return (
      <div className={styles.requestPanel}>
        <div className={styles.urlBar}>
          <span className={styles.wsLabel}>WS</span>
          <VariableAwareInput
            className={styles.urlInput}
            value={url}
            onChange={setUrlDirty}
            onPaste={handleUrlPaste}
            variables={variables || {}}
            placeholder="ws:// or wss://"
          />
        </div>
        <WebSocketPanel url={url} />
      </div>
    );
  }

  return (
    <div className={styles.requestPanel}>
      {/* Breadcrumb + actions row (folder, name, environment, save) */}
      <div className={styles.requestHeaderBar}>
        <div className={styles.breadcrumb}>
          <svg
            className={styles.folderIcon}
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
          <span className={styles.breadcrumbName}>
            {selectedNode?.name ||
              extractValue(activeApi, 'name', 'Untitled Request')}
          </span>
        </div>

        <div className={styles.headerActions}>
          <EnvironmentSwitcher />

          <div className="actionsContainer">
            <Button
              variant="primary"
              className="actionsButton"
              onClick={handleSaveApiConfig}
              disabled={isUpdatingConfig}
              title={isDirty ? 'Unsaved changes — click to save' : 'Save API'}
            >
              {isUpdatingConfig ? 'Saving...' : isDirty ? '● Save' : 'Save'}
            </Button>
            <div className="dropdownContainer">
              <Button
                variant="secondary"
                size="small"
                className="dropdownButton"
                onClick={e => {
                  e.stopPropagation();
                  const dropdowns =
                    document.querySelectorAll('.dropdownContent');
                  dropdowns.forEach(dd => dd.classList.remove('active'));
                  e.currentTarget.nextElementSibling.classList.toggle('active');
                }}
              >
                ▼
              </Button>
              <div
                className="dropdownContent saveActionsDropdown"
                onClick={e => e.stopPropagation()}
              >
                <Button
                  variant="secondary"
                  onClick={handleRecordTestCase}
                  disabled={!response || !selectedNode?.id}
                  title="Record current request/response as a test case"
                >
                  Record as Test Case
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Request URL Bar */}
      <div className={styles.urlBar}>
        <select
          className={styles.methodSelector}
          value={method}
          onChange={e => setMethodDirty(e.target.value)}
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
          <option value="PATCH">PATCH</option>
          <option value="HEAD">HEAD</option>
          <option value="OPTIONS">OPTIONS</option>
        </select>

        <VariableAwareInput
          className={styles.urlInput}
          value={url}
          onChange={setUrlDirty}
          onPaste={handleUrlPaste}
          variables={variables || {}}
          placeholder="Paste a URL or cURL command here"
        />

        {isFromCache && selectedNode?.id && (
          <button
            className={styles.cacheRefreshBtn}
            title="Loaded from local cache — click to fetch fresh data from server"
            onClick={() => {
              refreshApi(selectedNode.id).catch(err =>
                console.error('Refresh failed:', err)
              );
            }}
          >
            ↻ cached
          </button>
        )}

        <div className={styles.buttonGroup}>
          <div className="sendButtonContainer">
            <Button
              variant="primary"
              className={`${styles.sendButton} overrideSendButton`}
              onClick={handleDirectApiCall}
              disabled={isSending || !url}
            >
              {isSending ? 'Sending...' : 'Send'}
            </Button>

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
                <Button
                  variant="secondary"
                  onClick={handleValidateApi}
                  disabled={isSending || !url || !selectedNode?.id}
                >
                  Validate
                </Button>
              </div>
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
          className={`${styles.tab} ${activeTab === 'params' ? styles.active : ''}`}
          onClick={() => setActiveTab('params')}
        >
          Params
        </div>
        <div
          className={`${styles.tab} ${activeTab === 'auth' ? styles.active : ''}`}
          onClick={() => setActiveTab('auth')}
        >
          Auth
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
          className={`${styles.tab} ${activeTab === 'apiTests' ? styles.active : ''}`}
          onClick={() => setActiveTab('apiTests')}
        >
          Tests
        </div>
        <div
          className={`${styles.tab} ${activeTab === 'api' ? styles.active : ''}`}
          onClick={() => setActiveTab('api')}
        >
          Info
        </div>
      </div>

      {/* Request + Response split via react-resizable-panels */}
      <PanelGroup orientation="vertical" className={styles.panelGroup}>
        <Panel defaultSize="45%" minSize="20%" className={styles.requestTabsPanel}>
      {/* Tab Content */}
      <div
        className={styles.tabContent}
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

        {activeTab === 'auth' && (() => {
          const savedAuth = activeApi?.extra_meta?.auth;
          return (
            <AuthBuilder
              apiId={activeApi?.id ?? null}
              initialType={savedAuth?.type ?? 'none'}
              initialConfig={savedAuth?.config ?? {}}
            />
          );
        })()}

        {activeTab === 'params' && (
          <div className={styles.paramsContent}>
            <div className={styles.paramTable}>
              <div className={styles.paramHeader}>
                <div className={styles.paramCheckbox}></div>
                <div className={styles.paramKey}>KEY</div>
                <div className={styles.paramValue}>VALUE</div>
                <div className={styles.paramDescription}>DESCRIPTION</div>
              </div>
              {params.map((param, idx) => (
                <div className={styles.paramRow} key={idx}>
                  <div className={styles.paramCheckbox}>
                    <input type="checkbox" defaultChecked />
                  </div>
                  <div className={styles.paramKey}>
                    <input
                      type="text"
                      value={param.key}
                      onChange={e => {
                        const newParams = [...params];
                        newParams[idx].key = e.target.value;
                        setParamsDirty(newParams);
                      }}
                      placeholder="Key"
                    />
                  </div>
                  <div className={styles.paramValue}>
                    <input
                      type="text"
                      value={param.value}
                      onChange={e => {
                        const newParams = [...params];
                        newParams[idx].value = e.target.value;
                        setParamsDirty(newParams);
                      }}
                      placeholder="Value"
                    />
                  </div>
                  <div className={styles.paramDescription}>
                    <input
                      type="text"
                      value={param.description}
                      onChange={e => {
                        const newParams = [...params];
                        newParams[idx].description = e.target.value;
                        setParamsDirty(newParams);
                      }}
                      placeholder="Description"
                    />
                  </div>
                </div>
              ))}
              {/* Empty row for adding new param */}
              <div className={styles.paramRow}>
                <div className={styles.paramCheckbox}>
                  <input type="checkbox" disabled />
                </div>
                <div className={styles.paramKey}>
                  <input
                    type="text"
                    defaultValue={''}
                    onBlur={e => {
                      if (e.target.value) {
                        setParamsDirty([
                          ...params,
                          { key: e.target.value, value: '', description: '' },
                        ]);
                        e.target.value = '';
                      }
                    }}
                    placeholder="Key"
                  />
                </div>
                <div className={styles.paramValue}>
                  <input
                    type="text"
                    defaultValue={''}
                    disabled
                    placeholder="Value"
                  />
                </div>
                <div className={styles.paramDescription}>
                  <input
                    type="text"
                    defaultValue={''}
                    disabled
                    placeholder="Description"
                  />
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

              {/* Render headers from state */}
              {headers.map((header, idx) => (
                <div className={styles.paramRow} key={idx}>
                  <div className={styles.paramCheckbox}>
                    <input type="checkbox" defaultChecked />
                  </div>
                  <div className={styles.paramKey}>
                    <input
                      type="text"
                      value={header.key}
                      onChange={e => {
                        const newHeaders = [...headers];
                        newHeaders[idx].key = e.target.value;
                        setHeadersDirty(newHeaders);
                      }}
                      placeholder="Key"
                    />
                  </div>
                  <div className={styles.paramValue}>
                    <input
                      type="text"
                      value={header.value}
                      onChange={e => {
                        const newHeaders = [...headers];
                        newHeaders[idx].value = e.target.value;
                        setHeadersDirty(newHeaders);
                      }}
                      placeholder="Value"
                    />
                  </div>
                  <div className={styles.paramDescription}>
                    <input
                      type="text"
                      value={header.description}
                      onChange={e => {
                        const newHeaders = [...headers];
                        newHeaders[idx].description = e.target.value;
                        setHeadersDirty(newHeaders);
                      }}
                      placeholder="Description"
                    />
                  </div>
                </div>
              ))}

              {/* Empty row for adding new header */}
              <div className={styles.paramRow}>
                <div className={styles.paramCheckbox}>
                  <input type="checkbox" disabled />
                </div>
                <div className={styles.paramKey}>
                  <input
                    type="text"
                    defaultValue={''}
                    onBlur={e => {
                      if (e.target.value) {
                        setHeadersDirty([
                          ...headers,
                          { key: e.target.value, value: '', description: '' },
                        ]);
                        e.target.value = '';
                      }
                    }}
                    placeholder="Key"
                  />
                </div>
                <div className={styles.paramValue}>
                  <input
                    type="text"
                    defaultValue={''}
                    disabled
                    placeholder="Value"
                  />
                </div>
                <div className={styles.paramDescription}>
                  <input
                    type="text"
                    defaultValue={''}
                    disabled
                    placeholder="Description"
                  />
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
                  setBodyTypeDirty('none');
                  setBodyContentDirty('');
                }}
              >
                none
              </div>
              <div
                className={`${styles.bodyTypeBadge} ${bodyType === 'raw' ? styles.active : ''}`}
                onClick={() => {
                  setBodyTypeDirty('raw');
                  if (bodyType === 'JSON') {
                    try {
                      const obj = JSON.parse(bodyContent);
                      setBodyContentDirty(JSON.stringify(obj));
                    } catch (e) {}
                  }
                }}
              >
                raw
              </div>
              <div
                className={`${styles.bodyTypeBadge} ${bodyType === 'JSON' ? styles.active : ''}`}
                onClick={() => {
                  setBodyTypeDirty('JSON');
                  if (bodyType === 'raw' && bodyContent.trim()) {
                    try {
                      const obj = JSON.parse(bodyContent);
                      setBodyContentDirty(JSON.stringify(obj, null, 2));
                    } catch (e) {
                      if (!bodyContent.includes('{') && !bodyContent.includes('[')) {
                        setBodyContentDirty('{}');
                      }
                    }
                  } else if (bodyType === 'none' || !bodyContent) {
                    setBodyContentDirty('{}');
                  }
                }}
              >
                JSON
              </div>
              <div
                className={`${styles.bodyTypeBadge} ${bodyType === 'XML' ? styles.active : ''}`}
                onClick={() => {
                  setBodyTypeDirty('XML');
                  if (bodyType === 'none' || !bodyContent) {
                    setBodyContentDirty(`<root>\n  <name>Example</name>\n</root>`);
                  }
                }}
              >
                XML
              </div>
              <div
                className={`${styles.bodyTypeBadge} ${bodyType === 'form-data' ? styles.active : ''}`}
                onClick={() => setBodyTypeDirty('form-data')}
              >
                form-data
              </div>
              <div
                className={`${styles.bodyTypeBadge} ${bodyType === 'url-encoded' ? styles.active : ''}`}
                onClick={() => setBodyTypeDirty('url-encoded')}
              >
                url-encoded
              </div>
              <div
                className={`${styles.bodyTypeBadge} ${bodyType === 'graphql' ? styles.active : ''}`}
                onClick={() => setBodyTypeDirty('graphql')}
              >
                GraphQL
              </div>
            </div>

            {bodyType === 'JSON' && (
              <CodeMirror
                value={bodyContent}
                height="100%"
                minHeight="120px"
                extensions={[jsonLang()]}
                
                onChange={val => setBodyContentDirty(val)}
                className={styles.bodyCodeMirror}
                basicSetup={{ lineNumbers: true, foldGutter: true }}
              />
            )}
            {(bodyType === 'form-data' || bodyType === 'url-encoded') && (
              <KeyValueBodyTable
                rows={bodyType === 'form-data' ? formDataRows : urlEncodedRows}
                setRows={bodyType === 'form-data' ? setFormDataRows : setUrlEncodedRows}
                onSerialize={serialized => setBodyContentDirty(serialized)}
              />
            )}
            {bodyType !== 'none' && bodyType !== 'JSON' && bodyType !== 'form-data' && bodyType !== 'url-encoded' && (
              <JsonEditor
                value={bodyContent}
                onChange={setBodyContentDirty}
                placeholder={
                  bodyType === 'raw'
                    ? 'Enter raw text'
                    : bodyType === 'XML'
                      ? 'Enter XML data'
                      : ''
                }
                language="text"
                showCopyButton={true}
                resizable={true}
                minHeight={150}
                maxHeight={400}
                className={styles.bodyJsonEditor}
              />
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
            {bodyType === 'graphql' && (
              <div className={styles.gqlPanel}>
                <div className={styles.gqlPanelRow}>
                  <div className={styles.gqlLabel}>Query</div>
                  <button
                    className={styles.gqlSchemaBtn}
                    disabled={gqlSchemaLoading}
                    onClick={async () => {
                      if (!url) return;
                      setGqlSchemaLoading(true);
                      setGqlSchemaError(null);
                      try {
                        const API_BASE = import.meta.env.VITE_API_BASE || 'https://api-testing-2vjt.onrender.com';
                        const token = localStorage.getItem('token');
                        const res = await fetch(`${API_BASE}/api/graphql-introspect`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            Authorization: token?.startsWith('Bearer ') ? token : `Bearer ${token}`,
                          },
                          body: JSON.stringify({ url }),
                        });
                        const data = await res.json();
                        if (data.error) setGqlSchemaError(data.error);
                        else setGqlSchemaError(null);
                      } catch (err) {
                        setGqlSchemaError('Failed to load schema');
                      } finally {
                        setGqlSchemaLoading(false);
                      }
                    }}
                  >
                    {gqlSchemaLoading ? 'Loading…' : 'Load Schema'}
                  </button>
                </div>
                {gqlSchemaError && (
                  <div style={{ color: 'var(--error)', fontSize: 11, marginBottom: 4 }}>{gqlSchemaError}</div>
                )}
                <CodeMirror
                  value={gqlQuery}
                  height="120px"
                  
                  onChange={val => setGqlQuery(val)}
                  className={styles.bodyCodeMirror}
                  basicSetup={{ lineNumbers: true }}
                  placeholder="{ user(id: 1) { name email } }"
                />
                <div className={styles.gqlLabel} style={{ marginTop: 8 }}>Variables (JSON)</div>
                <CodeMirror
                  value={gqlVariables}
                  height="80px"
                  extensions={[jsonLang()]}
                  
                  onChange={val => setGqlVariables(val)}
                  className={styles.bodyCodeMirror}
                  basicSetup={{ lineNumbers: false }}
                  placeholder="{}"
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'validation' && (
          <div className={styles.validationContent}>
            <div className={styles.validationSection}>
              <JsonEditor
                value={validationSchema}
                onChange={setValidationSchema}
                placeholder="Enter validation schema for API responses"
                language="json"
                showCopyButton={true}
                resizable={true}
                minHeight={200}
                maxHeight={500}
                editorId="validationSchemaTextarea"
                className={styles.validationJsonEditor}
              />
            </div>

            {/* Validation buttons have been removed as requested */}
          </div>
        )}

        {activeTab === 'variables' && (
          <CollectionVarEditor nodeId={selectedNode?.id} />
        )}

        {activeTab === 'apiTests' && (
          <div className={styles.testsContent}>
            <div className={styles.testsHeader}>
              <h3>API Test Cases</h3>
              <div className={styles.testHeaderButtons}>
                <Button
                  variant="primary"
                  className={styles.addTestButton}
                  onClick={() => {
                    setEditingTestCaseId(null);
                    setShowTestCaseForm(true);
                  }}
                >
                  {activeApi ? 'Add Test Case' : 'Save API First'}
                </Button>
                {activeApi && testCases && testCases.length > 0 && (
                  <>
                    <Button
                      variant="danger"
                      className={styles.deleteAllButton}
                      onClick={handleDeleteTestCases}
                      disabled={isSending}
                    >
                      {selectedTestCases.length > 0
                        ? `Delete Selected (${selectedTestCases.length})`
                        : 'Delete All'}
                    </Button>
                    <Button
                      variant="secondary"
                      className={styles.runSelectedTestsButton}
                      onClick={handleRunSelectedTests}
                      disabled={isSending || selectedTestCases.length === 0}
                    >
                      {isSending
                        ? 'Running...'
                        : `Run Selected (${selectedTestCases.length})`}
                    </Button>
                    <Button
                      variant="primary"
                      className={styles.runAllTestsButton}
                      onClick={() => {
                        if (!selectedNode?.id) {
                          console.error(
                            'No selected node ID available for running all tests'
                          );
                          return;
                        }
                        runTest(selectedNode.id);
                      }}
                      disabled={isSending}
                    >
                      {isSending ? 'Running...' : 'Run All Tests'}
                    </Button>
                  </>
                )}
              </div>
            </div>

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
                          <Button
                            variant="primary"
                            size="small"
                            className={styles.runTestButton}
                            onClick={() => {
                              if (!selectedNode?.id) {
                                console.error(
                                  'No selected node ID available for running test'
                                );
                                return;
                              }
                              runTest(
                                selectedNode.id,
                                testCase.id || testCase.case_id
                              );
                            }}
                            disabled={isSending}
                          >
                            {isSending ? 'Running...' : 'Run'}
                          </Button>
                          <Button
                            variant="secondary"
                            size="small"
                            className={styles.editTestButton}
                            onClick={() => {
                              setEditingTestCaseId(
                                testCase.id || testCase.case_id
                              );
                              setShowTestCaseForm(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            size="small"
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
                          </Button>
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
                  <Button
                    variant="primary"
                    className={styles.createButton}
                    onClick={() => {
                      setEditingTestCaseId(null);
                      setShowTestCaseForm(true);
                    }}
                  >
                    Create Test Case
                  </Button>
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

            {testResults && (
              <div className={styles.testResultsSummary}>
                <div className={styles.testResultsHeader}>
                  <h4>Test Results</h4>
                  <div className={styles.testResultsActions}>
                    <Button
                      variant="primary"
                      size="small"
                      className={styles.copyExcelButton}
                      onClick={async () => {
                        try {
                          const excelData =
                            transformTestResultsToExcel(testResults);
                          await copyTableToClipboard(excelData);
                          setExcelCopied(true);
                          setTimeout(() => setExcelCopied(false), 2000);
                        } catch (err) {
                          console.error('Error creating Excel data:', err);
                          alert(
                            'Error preparing data for Excel. Please try again.'
                          );
                        }
                      }}
                    >
                      {excelCopied ? '✓ Copied!' : '📋 Copy Excel'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="small"
                      className={styles.clearResultsButton}
                      onClick={clearTestResults}
                    >
                      Clear Results
                    </Button>
                  </div>
                </div>

                <TestResultsGrid
                  testResults={(() => {
                    // Handle different result formats based on your API response structure
                    let resultsArray = [];

                    if (Array.isArray(testResults)) {
                      // If testResults is directly an array (like your sample data)
                      resultsArray = testResults;
                    } else if (testResults.test_cases) {
                      // If wrapped in test_cases property
                      resultsArray = testResults.test_cases;
                    } else if (testResults.data) {
                      // If wrapped in data property
                      resultsArray = Array.isArray(testResults.data)
                        ? testResults.data
                        : [testResults.data];
                    } else if (testResults) {
                      // Single result object
                      resultsArray = [testResults];
                    }

                    return resultsArray;
                  })()}
                  title=""
                  loading={isSending}
                  error={testResults.error}
                  onSaveTestCase={handleSaveTestCaseFromCard}
                  onRunTest={handleRunSingleTest}
                />
              </div>
            )}
          </div>
        )}

      </div>
        </Panel>
        <PanelResizeHandle className={styles.verticalResizeHandle} />
        <Panel defaultSize="45%" minSize="15%" className={styles.responsePanel}>
          {/* Response Panel — always visible */}
          <div className={styles.responsePanelInner}>
            {response ? (
              <>
                <div className={styles.responseMeta}>
                  <div
                    className={`${styles.statusBadge} ${response.status < 300 ? styles.success : styles.error}`}
                  >
                    {response.status} {response.statusText}
                  </div>
                  <div className={styles.responseInfo}>
                    <span>{response.time}</span>
                    <span>{response.size}</span>
                  </div>
                  <div className={styles.responseActions}>
                    <CopyButton textToCopy={responseBodyValue} className={styles.copyResponseBtn} />
                    <CopyButton
                      textToCopy={buildCurlCommand({
                        method,
                        url,
                        headers: Object.fromEntries(
                          headers.filter(h => h.key).map(h => [h.key, h.value])
                        ),
                        body: bodyType === 'JSON' && bodyContent ? (() => { try { return JSON.parse(bodyContent); } catch { return null; } })() : null,
                      })}
                      className={styles.copyResponseBtn}
                      label="Copy cURL"
                    />
                  </div>
                </div>

                <div className={styles.responseTabs}>
                  <div
                    className={`${styles.responseTab} ${responseTab === 'body' ? styles.active : ''}`}
                    onClick={() => setResponseTab('body')}
                  >
                    Pretty
                  </div>
                  <div
                    className={`${styles.responseTab} ${responseTab === 'raw' ? styles.active : ''}`}
                    onClick={() => setResponseTab('raw')}
                  >
                    Raw
                  </div>
                  <div
                    className={`${styles.responseTab} ${responseTab === 'headers' ? styles.active : ''}`}
                    onClick={() => setResponseTab('headers')}
                  >
                    Headers
                  </div>
                </div>

                <div className={styles.responseBody}>
                  {responseTab === 'body' && (
                    <div className={`${styles.responseBodyContent} scrollable`}>
                      <CodeMirror
                        value={responseBodyValue}
                        height="100%"
                        extensions={[jsonLang()]}
                        
                        readOnly
                        className={styles.responseCodeMirror}
                        basicSetup={{ lineNumbers: true, foldGutter: true }}
                      />
                    </div>
                  )}
                  {responseTab === 'raw' && (
                    <div className={`${styles.responseBodyContent} scrollable`}>
                      <pre className={styles.rawResponsePre}>{responseBodyValue}</pre>
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
            ) : (
              <div className={styles.emptyResponse}>
                <div>
                  <img
                    src={thinkingGif}
                    alt="Thinking animation"
                    style={{ width: 80, height: 80, objectFit: 'contain' }}
                  />
                  <p>Send a request to see the response</p>
                </div>
              </div>
            )}
          </div>
        </Panel>
      </PanelGroup>

      {/* Test Case Form Modal */}
      {showTestCaseForm && selectedNode?.type === 'file' && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3>
                {editingTestCaseId ? 'Edit Test Case' : 'Create Test Case'}
              </h3>
              <Button
                variant="secondary"
                size="small"
                className={styles.closeButton}
                onClick={() => setShowTestCaseForm(false)}
              >
                ×
              </Button>
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

      {/* Detailed Test Result Modal */}
      {showDetailedResult && selectedTestResult && (
        <div className={styles.modalOverlay} style={{ zIndex: 1000 }}>
          <div className={styles.detailedResultModal}>
            <div className={styles.modalHeader}>
              <h3>Test Result Details</h3>
              <div className={styles.modalHeaderActions}>
                <Button
                  variant="primary"
                  size="small"
                  onClick={handleEditApiInModal}
                  disabled={editingApiInModal}
                >
                  {editingApiInModal ? 'Editing...' : 'Edit API'}
                </Button>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={handleRunTestFromModal}
                  disabled={isSending}
                >
                  {isSending ? 'Running...' : 'Re-run Test'}
                </Button>
                <Button variant="primary" size="small" onClick={() => {}}>
                  Save Changes
                </Button>
                <Button
                  variant="secondary"
                  size="small"
                  className={styles.closeButton}
                  onClick={handleCloseDetailedResult}
                >
                  ×
                </Button>
              </div>
            </div>

            <div className={styles.detailedResultContent}>
              {/* Test Summary */}
              <div className={styles.testSummary}>
                <div className={styles.testSummaryHeader}>
                  <h4>
                    {selectedTestResult.case ||
                      selectedTestResult.name ||
                      'Test Result'}
                  </h4>
                  <span
                    className={`${styles.testStatusBadge} ${
                      (selectedTestResult.ok ?? selectedTestResult.passed)
                        ? styles.passed
                        : styles.failed
                    }`}
                  >
                    {(selectedTestResult.ok ?? selectedTestResult.passed)
                      ? 'PASSED'
                      : 'FAILED'}
                  </span>
                </div>

                {/* Test Case Summary - Clean Simple Layout */}
                <div className={styles.testCaseSummary}>
                  <div className={styles.testCaseHeader}>
                    <h3>
                      {selectedTestResult.case ||
                        selectedTestResult.name ||
                        'Test Case'}
                    </h3>
                    <div
                      className={`${styles.statusBadge} ${
                        (selectedTestResult.ok ??
                        selectedTestResult.passed ??
                        false)
                          ? styles.statusPassed
                          : styles.statusFailed
                      }`}
                    >
                      {(selectedTestResult.ok ??
                      selectedTestResult.passed ??
                      false)
                        ? 'PASSED'
                        : 'FAILED'}
                    </div>
                  </div>

                  <div className={styles.testMetricsGrid}>
                    <div className={styles.metricItem}>
                      <span className={styles.metricLabel}>STATUS CODE:</span>
                      <span className={styles.metricValue}>
                        {selectedTestResult.status_code ||
                          selectedTestResult.response?.status_code ||
                          'N/A'}
                      </span>
                    </div>

                    <div className={styles.metricItem}>
                      <span className={styles.metricLabel}>DURATION:</span>
                      <span className={styles.metricValue}>
                        {selectedTestResult.duration_ms
                          ? `${selectedTestResult.duration_ms.toFixed(2)}ms`
                          : 'N/A'}
                      </span>
                    </div>

                    <div className={styles.metricItem}>
                      <span className={styles.metricLabel}>FAILURES:</span>
                      <span className={styles.metricValue}>
                        {selectedTestResult.failures?.length || 0}
                      </span>
                    </div>
                  </div>

                  {/* Failures Display */}
                  {selectedTestResult.failures &&
                    selectedTestResult.failures.length > 0 && (
                      <div className={styles.failuresDisplay}>
                        <h4>Failures:</h4>
                        <div className={styles.failuresList}>
                          {selectedTestResult.failures.map((failure, idx) => (
                            <div key={idx} className={styles.failureBlock}>
                              {failure}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              </div>

              {/* API Edit Section */}
              {editingApiInModal && modalApiData && (
                <div className={styles.apiEditSection}>
                  <div className={styles.sectionHeader}>
                    <h4>Edit API Configuration</h4>
                    <div className={styles.apiEditActions}>
                      <Button
                        variant="primary"
                        size="small"
                        onClick={handleSaveApiFromModal}
                        disabled={isUpdatingConfig}
                      >
                        {isUpdatingConfig ? 'Saving...' : 'Save API'}
                      </Button>
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => setEditingApiInModal(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>

                  <div className={styles.apiEditForm}>
                    <div className={styles.formRow}>
                      <label>API Name:</label>
                      <input
                        type="text"
                        value={modalApiData.name}
                        onChange={e =>
                          setModalApiData({
                            ...modalApiData,
                            name: e.target.value,
                          })
                        }
                        className={styles.formInput}
                      />
                    </div>

                    <div className={styles.formRow}>
                      <label>Method:</label>
                      <select
                        value={modalApiData.method}
                        onChange={e =>
                          setModalApiData({
                            ...modalApiData,
                            method: e.target.value,
                          })
                        }
                        className={styles.formSelect}
                      >
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="DELETE">DELETE</option>
                        <option value="PATCH">PATCH</option>
                      </select>
                    </div>

                    <div className={styles.formRow}>
                      <label>Endpoint:</label>
                      <input
                        type="text"
                        value={modalApiData.endpoint}
                        onChange={e =>
                          setModalApiData({
                            ...modalApiData,
                            endpoint: e.target.value,
                          })
                        }
                        className={styles.formInput}
                      />
                    </div>

                    <div className={styles.formRow}>
                      <label>Description:</label>
                      <textarea
                        value={modalApiData.description}
                        onChange={e =>
                          setModalApiData({
                            ...modalApiData,
                            description: e.target.value,
                          })
                        }
                        className={styles.formTextarea}
                        rows="3"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Request Details */}
              {selectedTestResult.request && (
                <div className={styles.detailSection}>
                  <div className={styles.sectionHeader}>
                    <h4>Request Details</h4>
                    <CopyButton
                      textToCopy={JSON.stringify(
                        selectedTestResult.request,
                        null,
                        2
                      )}
                    />
                  </div>

                  <div className={styles.requestDetails}>
                    <div className={styles.requestLine}>
                      <span className={styles.requestMethod}>
                        {selectedTestResult.request.method}
                      </span>
                      <span className={styles.requestUrl}>
                        {selectedTestResult.request.url}
                      </span>
                    </div>

                    {/* Headers Section - Always show */}
                    <div className={styles.detailSubsection}>
                      <h5>Headers:</h5>
                      {selectedTestResult.request.headers &&
                      Object.keys(selectedTestResult.request.headers).length >
                        0 ? (
                        <JsonEditor
                          value={JSON.stringify(
                            selectedTestResult.request.headers,
                            null,
                            2
                          )}
                          onChange={value => {
                            try {
                              const parsed = JSON.parse(value);
                              // Update the test result data
                              setSelectedTestResult(prev => ({
                                ...prev,
                                request: {
                                  ...prev.request,
                                  headers: parsed,
                                },
                              }));
                            } catch (err) {
                              console.warn('Invalid JSON for headers:', err);
                            }
                          }}
                          language="json"
                          showCopyButton={true}
                          resizable={true}
                          minHeight={100}
                          maxHeight={300}
                          className={styles.modalJsonEditor}
                        />
                      ) : (
                        <div className={styles.emptyState}>
                          <p>No headers found</p>
                        </div>
                      )}
                    </div>

                    {/* Parameters Section - Always show */}
                    <div className={styles.detailSubsection}>
                      <h5>Parameters:</h5>
                      {selectedTestResult.request.params &&
                      Object.keys(selectedTestResult.request.params).length >
                        0 ? (
                        <JsonEditor
                          value={JSON.stringify(
                            selectedTestResult.request.params,
                            null,
                            2
                          )}
                          onChange={value => {
                            try {
                              const parsed = JSON.parse(value);
                              setSelectedTestResult(prev => ({
                                ...prev,
                                request: {
                                  ...prev.request,
                                  params: parsed,
                                },
                              }));
                            } catch (err) {
                              console.warn('Invalid JSON for params:', err);
                            }
                          }}
                          language="json"
                          showCopyButton={true}
                          resizable={true}
                          minHeight={100}
                          maxHeight={300}
                          className={styles.modalJsonEditor}
                        />
                      ) : (
                        <div className={styles.emptyState}>
                          <p>No parameters found</p>
                        </div>
                      )}
                    </div>

                    {/* Body Section - Always show */}
                    <div className={styles.detailSubsection}>
                      <h5>Body:</h5>
                      {selectedTestResult.request.body ? (
                        <JsonEditor
                          value={JSON.stringify(
                            selectedTestResult.request.body,
                            null,
                            2
                          )}
                          onChange={value => {
                            try {
                              const parsed = JSON.parse(value);
                              setSelectedTestResult(prev => ({
                                ...prev,
                                request: {
                                  ...prev.request,
                                  body: parsed,
                                },
                              }));
                            } catch (err) {
                              console.warn('Invalid JSON for body:', err);
                            }
                          }}
                          language="json"
                          showCopyButton={true}
                          resizable={true}
                          minHeight={100}
                          maxHeight={400}
                          className={styles.modalJsonEditor}
                        />
                      ) : (
                        <div className={styles.emptyState}>
                          <p>No body content</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Response Details */}
              {selectedTestResult.response && (
                <div className={styles.detailSection}>
                  <div className={styles.sectionHeader}>
                    <h4>Response Details</h4>
                    <CopyButton
                      textToCopy={JSON.stringify(
                        selectedTestResult.response,
                        null,
                        2
                      )}
                    />
                  </div>

                  <div className={styles.responseDetails}>
                    <div className={styles.responseStatusLine}>
                      <span className={styles.responseStatus}>
                        Status:{' '}
                        {selectedTestResult.response.status_code ||
                          selectedTestResult.status_code ||
                          'Unknown'}
                      </span>
                    </div>

                    {/* Response Headers - if available */}
                    {selectedTestResult.response.headers && (
                      <div className={styles.detailSubsection}>
                        <h5>Response Headers:</h5>
                        <JsonEditor
                          value={JSON.stringify(
                            selectedTestResult.response.headers,
                            null,
                            2
                          )}
                          onChange={value => {
                            try {
                              const parsed = JSON.parse(value);
                              setSelectedTestResult(prev => ({
                                ...prev,
                                response: {
                                  ...prev.response,
                                  headers: parsed,
                                },
                              }));
                            } catch (err) {
                              console.warn(
                                'Invalid JSON for response headers:',
                                err
                              );
                            }
                          }}
                          language="json"
                          showCopyButton={true}
                          resizable={true}
                          minHeight={100}
                          maxHeight={300}
                          className={styles.modalJsonEditor}
                        />
                      </div>
                    )}

                    {/* Response Body */}
                    <div className={styles.detailSubsection}>
                      <h5>Response Body:</h5>
                      {selectedTestResult.response.json ? (
                        <JsonEditor
                          value={JSON.stringify(
                            selectedTestResult.response.json,
                            null,
                            2
                          )}
                          onChange={value => {
                            try {
                              const parsed = JSON.parse(value);
                              setSelectedTestResult(prev => ({
                                ...prev,
                                response: {
                                  ...prev.response,
                                  json: parsed,
                                },
                              }));
                            } catch (err) {
                              console.warn(
                                'Invalid JSON for response body:',
                                err
                              );
                            }
                          }}
                          language="json"
                          showCopyButton={true}
                          resizable={true}
                          minHeight={150}
                          maxHeight={400}
                          className={styles.modalJsonEditor}
                        />
                      ) : selectedTestResult.response.text ? (
                        <JsonEditor
                          value={selectedTestResult.response.text}
                          onChange={value => {
                            setSelectedTestResult(prev => ({
                              ...prev,
                              response: {
                                ...prev.response,
                                text: value,
                              },
                            }));
                          }}
                          language="text"
                          showCopyButton={true}
                          resizable={true}
                          minHeight={100}
                          maxHeight={300}
                          className={styles.modalJsonEditor}
                        />
                      ) : (
                        <div className={styles.emptyState}>
                          <p>No response body content</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Expected vs Actual (if available) */}
              {selectedTestResult.expected && (
                <div className={styles.detailSection}>
                  <div className={styles.sectionHeader}>
                    <h4>Expected Results</h4>
                    <CopyButton
                      textToCopy={JSON.stringify(
                        selectedTestResult.expected,
                        null,
                        2
                      )}
                    />
                  </div>

                  <div className={styles.expectedDetails}>
                    <JsonEditor
                      value={JSON.stringify(
                        selectedTestResult.expected,
                        null,
                        2
                      )}
                      onChange={value => {
                        try {
                          const parsed = JSON.parse(value);
                          setSelectedTestResult(prev => ({
                            ...prev,
                            expected: parsed,
                          }));
                        } catch (err) {
                          console.warn(
                            'Invalid JSON for expected results:',
                            err
                          );
                        }
                      }}
                      language="json"
                      showCopyButton={true}
                      resizable={true}
                      minHeight={150}
                      maxHeight={400}
                      className={styles.modalJsonEditor}
                    />
                  </div>
                </div>
              )}

              {/* API Configuration (if available) */}
              {selectedTestResult.api && (
                <div className={styles.detailSection}>
                  <div className={styles.sectionHeader}>
                    <h4>API Configuration</h4>
                  </div>

                  <div className={styles.apiConfigDetails}>
                    <div className={styles.configRow}>
                      <span className={styles.configLabel}>Method:</span>
                      <span className={styles.configValue}>
                        {selectedTestResult.api.method}
                      </span>
                    </div>
                    <div className={styles.configRow}>
                      <span className={styles.configLabel}>Endpoint:</span>
                      <span className={styles.configValue}>
                        {selectedTestResult.api.endpoint}
                      </span>
                    </div>
                    {selectedTestResult.api.path && (
                      <div className={styles.configRow}>
                        <span className={styles.configLabel}>Path:</span>
                        <span className={styles.configValue}>
                          {selectedTestResult.api.path}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
