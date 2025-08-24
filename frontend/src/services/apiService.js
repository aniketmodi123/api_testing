import { api } from '../api.js';

/**
 * Service for managing APIs and test cases
 */
export const apiService = {
  /**
   * Create a new API in a file
   * @param {number} fileId - File ID to create the API in
   * @param {Object} apiData - API data
   * @returns {Promise} Promise with created API data
   */
  async createApi(fileId, apiData) {
    try {
      console.log(`Creating API in file ${fileId}:`, apiData);
      const response = await api.post(`/file/${fileId}/api`, apiData);
      return response.data;
    } catch (error) {
      console.error('Error creating API:', error);
      throw error;
    }
  },

  /**
   * List all APIs (with optional search filters)
   * @param {Object} filters - Optional search filters
   * @returns {Promise} Promise with API list
   */
  async listApis(filters = {}) {
    try {
      console.log('Listing APIs with filters:', filters);
      const response = await api.get(`/api/list`, { params: filters });
      return response.data;
    } catch (error) {
      console.error('Error listing APIs:', error);
      throw error;
    }
  },

  /**
   * Get API details by file ID
   * @param {number} fileId - File ID containing the API
   * @param {boolean} includeCases - Whether to include test cases
   * @returns {Promise} Promise with API details
   */
  async getApi(fileId, includeCases = false) {
    try {
      console.log('Fetching API details for file:', fileId);
      const response = await api.get(`/file/${fileId}/api`, {
        params: { include_cases: includeCases },
      });

      // Handle the specific response structure
      if (response.data && response.data.data) {
        // Process the API data to ensure all fields are properly structured
        const apiData = response.data.data;

        // Ensure URL field is properly set from endpoint
        if (apiData.endpoint && !apiData.url) {
          apiData.url = apiData.endpoint;
        }

        // Normalize the method field (ensure uppercase)
        if (apiData.method) {
          apiData.method = apiData.method.toUpperCase();
        }

        // Ensure headers are properly structured
        if (!apiData.headers) {
          apiData.headers = {};

          // Extract headers from extra_meta if present
          if (apiData.extra_meta && apiData.extra_meta.headers) {
            apiData.headers = { ...apiData.extra_meta.headers };
          }
        }

        return {
          data: apiData,
          status: response.data.response_code,
          message: response.data.message || '',
        };
      }

      // Return the original structure if data processing fails
      return {
        data: response.data.data,
        status: response.data.response_code,
        message: response.data.message || '',
      };
    } catch (error) {
      console.error(`Error fetching API for file ${fileId}:`, error);
      throw error;
    }
  },

  /**
   * Update an existing API
   * @param {number} apiId - API ID to update
   * @param {Object} apiData - Updated API data
   * @returns {Promise} Promise with updated API data
   */
  async updateApi(apiId, apiData) {
    try {
      console.log(`Updating API ${apiId}:`, apiData);
      const response = await api.put(`/api/${apiId}`, apiData);
      return response.data;
    } catch (error) {
      console.error(`Error updating API ${apiId}:`, error);
      throw error;
    }
  },

  /**
   * Delete an API
   * @param {number} apiId - API ID to delete
   * @returns {Promise} Promise with deletion result
   */
  async deleteApi(apiId) {
    try {
      console.log(`Deleting API ${apiId}`);
      const response = await api.delete(`/api/${apiId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting API ${apiId}:`, error);
      throw error;
    }
  },

  /**
   * Create a new test case for an API
   * @param {number} fileId - File ID containing the API
   * @param {Object} testCaseData - Test case data
   * @returns {Promise} Promise with created test case data
   */
  async createTestCase(fileId, testCaseData) {
    try {
      console.log(`Creating test case for file ${fileId}:`, testCaseData);
      const response = await api.post(
        `/file/${fileId}/api/cases`,
        testCaseData
      );
      return response.data;
    } catch (error) {
      console.error('Error creating test case:', error);
      throw error;
    }
  },

  /**
   * Get test case details by ID
   * @param {number} caseId - Test case ID
   * @returns {Promise} Promise with test case details
   */
  async getTestCase(caseId) {
    try {
      console.log('Fetching test case details:', caseId);
      const response = await api.get(`/api/cases/${caseId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching test case ${caseId}:`, error);
      throw error;
    }
  },

  /**
   * List all test cases for an API
   * @param {number} fileId - File ID containing the API
   * @returns {Promise} Promise with test cases list
   */
  async listTestCases(fileId) {
    try {
      console.log(`Listing test cases for file ${fileId}`);
      // Get API with included test cases
      const response = await this.getApi(fileId, true);

      // If successful, extract test cases from response
      if (response && response.data && response.data.test_cases) {
        return {
          data: response.data.test_cases,
          status: response.status,
          message:
            response.message || `Found ${response.data.total_cases} test cases`,
          totalCount: response.data.total_cases || 0,
        };
      } else {
        return {
          data: [],
          status: response.status || 200,
          message: 'No test cases found',
          totalCount: 0,
        };
      }
    } catch (error) {
      console.error(`Error listing test cases for file ${fileId}:`, error);
      throw error;
    }
  },

  /**
   * Update an existing test case
   * @param {number} caseId - Test case ID to update
   * @param {Object} testCaseData - Updated test case data
   * @returns {Promise} Promise with updated test case data
   */
  async updateTestCase(caseId, testCaseData) {
    try {
      console.log(`Updating test case ${caseId}:`, testCaseData);
      const response = await api.put(`/api/cases/${caseId}`, testCaseData);
      return response.data;
    } catch (error) {
      console.error(`Error updating test case ${caseId}:`, error);
      throw error;
    }
  },

  /**
   * Delete a test case
   * @param {number} caseId - Test case ID to delete
   * @returns {Promise} Promise with deletion result
   */
  async deleteTestCase(caseId) {
    try {
      console.log(`Deleting test case ${caseId}`);
      const response = await api.delete(`/api/cases/${caseId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting test case ${caseId}:`, error);
      throw error;
    }
  },

  /**
   * Run a test case and get results
   * @param {number} fileId - File ID containing the API
   * @param {number|Array} caseId - Test case ID(s) to run (optional, runs all cases if not provided)
   * @returns {Promise} Promise with test execution results
   */
  async runTest(fileId, caseId = null) {
    try {
      console.log(`Running test for file ${fileId}, case IDs:`, caseId);
      const params = { file_id: fileId };
      if (caseId) {
        params.case_id = Array.isArray(caseId) ? caseId : [caseId];
      }
      const response = await api.get(`/run`, { params });

      // Handle the specific response structure
      return {
        data: response.data.data,
        status: response.data.response_code,
        message: response.data.message || 'Test executed successfully',
      };
    } catch (error) {
      console.error('Error running test:', error);
      throw error;
    }
  },
};
