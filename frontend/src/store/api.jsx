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

      if (result && result.data) {
        // Format the test results for consistent display
        const formattedResults = {
          status: result.status,
          statusText: result.message || '',
          time: result.data.execution_time || '0 ms',
          size: result.data.response_size || '0 B',
          body: result.data.response || {},
          headers: result.data.response_headers || {},
          passed: result.data.passed || false,
          details: result.data.validation_details || [],
        };

        set({ testResults: formattedResults });
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
