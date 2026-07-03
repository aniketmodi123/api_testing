import { api } from '../api.js';

/**
 * Service for managing APIs, their test cases, and bulk test schedules over HTTP.
 */
export const apiService = {
  /**
   * Get API details by file ID
   * @param {number} fileId - File ID containing the API
   * @param {boolean} includeCases - Whether to include test cases
   * @returns {Promise} Promise with API details
   */
  async getApi(fileId, includeCases = false) {
    try {
      const response = await api.get(`/file/${fileId}/api`, {
        params: { include_cases: includeCases },
      });

      // Handle the specific response structure
      // Check for status code 206 which indicates no API data found
      if (response.data && response.data.response_code === 206) {
        return {
          data: null,
          status: response.data.response_code,
          message: response.data.message || 'API not found',
        };
      }

      if (response.data && response.data.data) {
        // Process the API data to ensure all fields are properly structured
        const apiData = response.data.data;

        // Keep endpoint and url as separate fields without modification
        // Both will be used as-is without adding any base URL

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
   * Create a new test case for an API
   * @param {number} fileId - File ID containing the API
   * @param {Object} testCaseData - Test case data
   * @returns {Promise} Promise with created test case data
   */
  async createTestCase(fileId, testCaseData) {
    try {
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
   * Delete a test case
   * @param {number} caseId - Test case ID to delete
   * @returns {Promise} Promise with deletion result
   */
  async deleteTestCase(caseId) {
    try {
      const response = await api.delete(`/case/${caseId}`);
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
      // Validate fileId is provided
      if (!fileId) {
        throw new Error('fileId is required to run tests');
      }

      const body = { file_id: fileId };
      if (caseId) {
        body.case_id = Array.isArray(caseId) ? caseId : [caseId];
      }

      const response = await api.post(`/run`, body);

      // Handle both shapes:
      // 1) Wrapped: { response_code, message, data: [...] }
      // 2) Raw array: [ { ...caseResult }, ... ]
      const payload = response?.data;

      if (Array.isArray(payload)) {
        return {
          data: payload,
          status: 200,
          message: 'Test executed',
        };
      }

      // Fallback to wrapped structure
      return {
        data: payload?.data ?? [],
        status: payload?.response_code ?? 200,
        message: payload?.message || 'Test executed successfully',
      };
    } catch (error) {
      console.error('Error running test:', error);
      throw error;
    }
  },

  /**
   * Create a bulk test schedule
   * @param {Object} scheduleData - Schedule configuration
   * @param {string} username - Username for header
   * @param {number} workspaceId - Workspace ID for header
   * @returns {Promise} Promise with schedule creation result
   */
  async createBulkTestSchedule(scheduleData, username, workspaceId) {
    try {
      const response = await api.post('/schedules', scheduleData, {
        headers: {
          'Content-Type': 'application/json',
          username: username,
          'workspace-id': workspaceId,
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error creating bulk test schedule:', error);
      throw error;
    }
  },

  /**
   * Get bulk test schedules
   * @param {string} username - Username for header
   * @param {number} workspaceId - Workspace ID for header
   * @returns {Promise} Promise with schedules list
   */
  async getBulkTestSchedules(username, workspaceId) {
    try {
      const response = await api.get('/schedules', {
        headers: {
          username: username,
          'workspace-id': workspaceId,
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching bulk test schedules:', error);
      throw error;
    }
  },

  /**
   * Get bulk test execution results
   * @param {number} scheduleId - Schedule ID
   * @param {string} username - Username for header
   * @returns {Promise} Promise with execution results
   */
  async getBulkTestExecutions(scheduleId, username) {
    try {
      const response = await api.get(`/schedules/${scheduleId}/executions`, {
        headers: {
          username: username,
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching bulk test executions:', error);
      throw error;
    }
  },

  /**
   * Get all running/active bulk test executions across all schedules
   * @param {string} username - Username for header
   * @param {number} workspaceId - Workspace ID for header
   * @returns {Promise} Promise with running executions
   */
  async getRunningBulkTestExecutions(username, workspaceId) {
    try {
      const response = await api.get('/schedules/executions/running', {
        headers: {
          username: username,
          'workspace-id': workspaceId,
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching running bulk test executions:', error);
      throw error;
    }
  },

  /**
   * Delete a single bulk test execution (and its results)
   * @param {number} scheduleId - Parent schedule ID
   * @param {number} executionId - Execution ID to delete
   * @param {string} username - Username for header
   */
  async deleteBulkTestExecution(scheduleId, executionId, username) {
    try {
      const response = await api.delete(
        `/schedules/${scheduleId}/executions/${executionId}`,
        {
          headers: {
            username: username,
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error deleting bulk test execution:', error);
      throw error;
    }
  },

  /**
   * Delete a bulk test schedule
   * @param {number} scheduleId - Schedule ID to delete
   * @param {string} username - Username for header
   * @returns {Promise} Promise with deletion result
   */
  async deleteBulkTestSchedule(scheduleId, username) {
    try {
      const response = await api.delete(`/schedules/${scheduleId}`, {
        headers: {
          username: username,
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error deleting bulk test schedule:', error);
      throw error;
    }
  },

  /**
   * Update a bulk test schedule
   * @param {number} scheduleId - Schedule ID to update
   * @param {Object} scheduleData - Updated schedule data
   * @param {string} username - Username for header
   * @param {number} workspaceId - Workspace ID for header
   * @returns {Promise} Promise with update result
   */
  async updateBulkTestSchedule(
    scheduleId,
    scheduleData,
    username,
    workspaceId
  ) {
    try {
      const response = await api.put(`/schedules/${scheduleId}`, scheduleData, {
        headers: {
          'Content-Type': 'application/json',
          username: username,
          'workspace-id': workspaceId,
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error updating bulk test schedule:', error);
      throw error;
    }
  },
};
