import { create } from 'zustand';
import { apiService } from '../services/apiService';

/**
 * Store for managing API and test case state
 */
import { createContext } from 'react';

// Create context for ApiProvider
const ApiContext = createContext(null);

export const useApi = create((set, get) => ({
  // State
  activeApi: null,
  apis: [],
  testCases: [],
  selectedTestCase: null,
  isLoading: false,
  error: null,
  testResults: null,
  testCaseDetails: null,

  // Actions
  setLoading: isLoading => set({ isLoading }),
  setError: error => set({ error }),

  /**
   * Create a new API in a file
   * @param {number} fileId - File ID
   * @param {Object} apiData - API data
   */
  createApi: async (fileId, apiData) => {
    try {
      set({ isLoading: true, error: null });
      const result = await apiService.createApi(fileId, apiData);

      if (result && result.data) {
        set(state => ({
          apis: [...state.apis, result.data],
          activeApi: result.data,
        }));
      }

      return result;
    } catch (error) {
      set({ error: error.message || 'Failed to create API' });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  /**
   * List all APIs with optional filters
   * @param {Object} filters - Search filters
   */
  listApis: async (filters = {}) => {
    try {
      set({ isLoading: true, error: null });
      const result = await apiService.listApis(filters);

      if (result && result.data) {
        set({ apis: result.data });
      }

      return result;
    } catch (error) {
      set({ error: error.message || 'Failed to list APIs' });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  /**
   * Get API details by file ID
   * @param {number} fileId - File ID containing the API
   * @param {boolean} includeCases - Whether to include test cases
   */
  getApi: async (fileId, includeCases = false) => {
    try {
      set({ isLoading: true, error: null });
      const result = await apiService.getApi(fileId, includeCases);

      if (result && result.data) {
        // Further normalize the API data for UI consistency
        const normalizedApi = {
          ...result.data,
          // Ensure method is set
          method: result.data.method || 'GET',
          // Make sure URL is available (fallback to endpoint)
          url: result.data.url || result.data.endpoint || '',
          // Ensure description is available
          description: result.data.description || '',
          // Ensure headers are properly structured
          headers: result.data.headers || {},
        };

        set({ activeApi: normalizedApi });

        // If test cases are included, update them as well
        if (includeCases && result.data.test_cases) {
          set({ testCases: result.data.test_cases });
        }
      }

      return result;
    } catch (error) {
      set({ error: error.message || 'Failed to get API details' });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  /**
   * Save an API (create or update)
   * @param {number} fileId - File ID
   * @param {Object} apiData - API data
   */
  saveApi: async (fileId, apiData) => {
    try {
      set({ isLoading: true, error: null });
      const result = await apiService.saveApi(fileId, apiData);

      if (result && result.data) {
        // Update or add the API in the list and set as active
        set(state => {
          const existingApiIndex = state.apis.findIndex(
            api => api.file_id === fileId
          );
          let updatedApis;

          if (existingApiIndex >= 0) {
            // Update existing API
            updatedApis = [...state.apis];
            updatedApis[existingApiIndex] = result.data;
          } else {
            // Add new API
            updatedApis = [...state.apis, result.data];
          }

          return {
            apis: updatedApis,
            activeApi: result.data,
          };
        });
      }

      return result;
    } catch (error) {
      set({ error: error.message || 'Failed to save API' });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  /**
   * Update an API
   * @param {number} apiId - API ID
   * @param {Object} apiData - Updated API data
   */
  updateApi: async (apiId, apiData) => {
    try {
      set({ isLoading: true, error: null });
      const result = await apiService.updateApi(apiId, apiData);

      if (result && result.data) {
        // Update the API in the list and set as active
        set(state => ({
          apis: state.apis.map(api => (api.id === apiId ? result.data : api)),
          activeApi: result.data,
        }));
      }

      return result;
    } catch (error) {
      set({ error: error.message || 'Failed to update API' });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  /**
   * Delete an API
   * @param {number} apiId - API ID
   */
  deleteApi: async apiId => {
    try {
      set({ isLoading: true, error: null });
      const result = await apiService.deleteApi(apiId);

      // Remove from list and clear active if it was selected
      set(state => ({
        apis: state.apis.filter(api => api.id !== apiId),
        activeApi: state.activeApi?.id === apiId ? null : state.activeApi,
      }));

      return result;
    } catch (error) {
      set({ error: error.message || 'Failed to delete API' });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  /**
   * Duplicate an API to a new file
   * @param {number} fileId - File ID
   * @param {string} newApiName - Optional name for the new API
   * @param {boolean} includeCases - Whether to include test cases
   */
  duplicateApi: async (fileId, newApiName = null, includeCases = true) => {
    try {
      set({ isLoading: true, error: null });
      const result = await apiService.duplicateApi(
        fileId,
        newApiName,
        includeCases
      );
      return result;
    } catch (error) {
      set({ error: error.message || 'Failed to duplicate API' });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  /**
   * Create a new test case
   * @param {number} fileId - File ID
   * @param {Object} testCaseData - Test case data
   */
  createTestCase: async (fileId, testCaseData) => {
    try {
      set({ isLoading: true, error: null });
      const result = await apiService.createTestCase(fileId, testCaseData);

      if (result && result.data) {
        // Add new test case to list
        set(state => ({
          testCases: [...state.testCases, result.data],
          selectedTestCase: result.data,
        }));
      }

      return result;
    } catch (error) {
      set({ error: error.message || 'Failed to create test case' });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  /**
   * Bulk create multiple test cases
   * @param {number} fileId - File ID
   * @param {Array} testCasesData - Array of test case data objects
   */
  bulkCreateTestCases: async (fileId, testCasesData) => {
    try {
      set({ isLoading: true, error: null });
      const result = await apiService.bulkCreateTestCases(
        fileId,
        testCasesData
      );

      if (result && result.data && result.data.created) {
        // Add new test cases to list
        set(state => ({
          testCases: [...state.testCases, ...result.data.created],
        }));
      }

      return result;
    } catch (error) {
      set({ error: error.message || 'Failed to bulk create test cases' });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  /**
   * Save a test case (create or update)
   * @param {number} fileId - File ID
   * @param {Object} testCaseData - Test case data
   * @param {number|null} caseId - Optional test case ID for updates
   */
  saveTestCase: async (fileId, testCaseData, caseId = null) => {
    try {
      set({ isLoading: true, error: null });
      const result = await apiService.saveTestCase(
        fileId,
        testCaseData,
        caseId
      );

      if (result && result.data) {
        set(state => {
          let updatedCases;

          if (caseId) {
            // Update existing test case
            updatedCases = state.testCases.map(testCase =>
              testCase.id === caseId ? result.data : testCase
            );
          } else {
            // Add new test case
            updatedCases = [...state.testCases, result.data];
          }

          return {
            testCases: updatedCases,
            selectedTestCase: result.data,
          };
        });
      }

      return result;
    } catch (error) {
      set({ error: error.message || 'Failed to save test case' });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  /**
   * Get test cases for an API in a file
   * @param {number} fileId - File ID containing the API
   */
  getTestCases: async fileId => {
    try {
      set({ isLoading: true, error: null });

      // Instead of a separate call, we can leverage getApi with includeCases=true
      // and extract test cases from there for efficiency
      const result = await apiService.getApi(fileId, true);

      if (result && result.data && result.data.test_cases) {
        set({
          testCases: result.data.test_cases,
          activeApi: result.data, // Also update the active API
        });
      } else {
        set({ testCases: [] });
      }

      return result;
    } catch (error) {
      set({ error: error.message || 'Failed to get test cases' });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  /**
   * Select a test case
   * @param {Object|number} testCase - Test case object or ID
   */
  selectTestCase: async testCase => {
    try {
      // If a number was passed, fetch the test case details
      if (typeof testCase === 'number') {
        set({ isLoading: true, error: null });
        const result = await apiService.getTestCase(testCase);

        // Also fetch the detailed test case information
        try {
          const detailsResult = await apiService.getTestCaseDetails(testCase);
          if (detailsResult && detailsResult.data) {
            set({ testCaseDetails: detailsResult.data });
          }
        } catch (detailsError) {
          console.error(
            'Failed to fetch detailed test case information:',
            detailsError
          );
          // Don't throw this error, as we want to continue even if detailed info fails
        }

        if (result && result.data) {
          set({ selectedTestCase: result.data });
        }
      } else {
        set({ selectedTestCase: testCase });
      }
    } catch (error) {
      set({ error: error.message || 'Failed to select test case' });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  /**
   * Update a test case
   * @param {number} caseId - Test case ID
   * @param {Object} testCaseData - Updated test case data
   */
  updateTestCase: async (caseId, testCaseData) => {
    try {
      set({ isLoading: true, error: null });
      const result = await apiService.updateTestCase(caseId, testCaseData);

      if (result && result.data) {
        // Update the test case in the list and set as selected
        set(state => ({
          testCases: state.testCases.map(tc =>
            tc.id === caseId ? result.data : tc
          ),
          selectedTestCase: result.data,
        }));
      }

      return result;
    } catch (error) {
      set({ error: error.message || 'Failed to update test case' });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  /**
   * Delete a test case
   * @param {number} caseId - Test case ID
   */
  deleteTestCase: async caseId => {
    try {
      set({ isLoading: true, error: null });
      const result = await apiService.deleteTestCase(caseId);

      // Remove from list and clear selected if it was selected
      set(state => ({
        testCases: state.testCases.filter(tc => tc.id !== caseId),
        selectedTestCase:
          state.selectedTestCase?.id === caseId ? null : state.selectedTestCase,
      }));

      return result;
    } catch (error) {
      set({ error: error.message || 'Failed to delete test case' });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  /**
   * Run test cases and store results
   * @param {number} fileId - File ID
   * @param {number|Array} caseId - Test case ID(s) or null for all
   */
  runTest: async (fileId, caseId = null) => {
    try {
      set({ isLoading: true, error: null, testResults: null });
      const result = await apiService.runTest(fileId, caseId);
      console.log('runTest raw result:', result);

      if (result && result.data) {
        // Normalize different backend shapes into { test_cases: [...] }
        let normalized = null;

        // Helper to map various case result shapes into a consistent one
        const mapCase = (tc, index = 0) => ({
          id: tc?.id ?? tc?.case_id ?? index,
          name: tc?.name ?? tc?.case ?? `Test Case ${index + 1}`,
          // unify pass flag
          passed: Boolean(tc?.passed ?? tc?.ok ?? tc?.success ?? false),
          // unify failures/errors
          failures: Array.isArray(tc?.failures)
            ? tc.failures
            : tc?.error
              ? [tc.error]
              : [],
          status_code:
            tc?.status_code ?? tc?.status ?? tc?.response?.status_code ?? null,
          duration_ms:
            tc?.duration_ms ?? tc?.duration ?? tc?.execution_time ?? null,
          request: tc?.request ?? null,
          response: tc?.response ?? (tc?.json ? { json: tc.json } : null),
          raw: tc,
        });

        // If backend returned an array of case results
        if (Array.isArray(result.data)) {
          normalized = {
            test_cases: result.data.map((tc, idx) => mapCase(tc, idx)),
            status: result.status,
            message: result.message,
          };
        } else if (result.data.test_cases) {
          // Already in the expected shape
          normalized = {
            ...result.data,
            test_cases: (result.data.test_cases || []).map((tc, idx) =>
              mapCase(tc, idx)
            ),
            status: result.status,
            message: result.message,
          };
        } else {
          // Fallback: convert known fields into a single-item test_cases array
          const single = mapCase(
            {
              case_id: result.data.case_id,
              name:
                result.data.name || result.data.case || 'Single Test Execution',
              response: result.data.response || result.data.body,
              passed: result.data.passed,
              error: result.data.error,
              status_code: result.data.status_code ?? result.status,
              duration: result.data.execution_time || result.data.duration,
            },
            0
          );

          normalized = {
            test_cases: [single],
            status: result.status,
            message: result.message,
          };
        }

        set({ testResults: normalized });
      }

      return result;
    } catch (error) {
      set({ error: error.message || 'Failed to run test' });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  /**
   * Clear test results
   */
  clearTestResults: () => set({ testResults: null }),

  /**
   * Get detailed test case information by ID
   * @param {number} caseId - Test case ID
   */
  getTestCaseDetails: async caseId => {
    try {
      set({ isLoading: true, error: null });
      const result = await apiService.getTestCaseDetails(caseId);

      if (result && result.data) {
        set({ testCaseDetails: result.data });
      }

      return result;
    } catch (error) {
      set({ error: error.message || 'Failed to get test case details' });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  /**
   * Clear test case details
   */
  clearTestCaseDetails: () => set({ testCaseDetails: null }),
}));

/**
 * API Provider component for React context
 * Provides access to API store state and actions throughout the component tree
 */
export const ApiProvider = ({ children }) => {
  const apiStore = useApi();
  return <ApiContext.Provider value={apiStore}>{children}</ApiContext.Provider>;
};

export default useApi;
