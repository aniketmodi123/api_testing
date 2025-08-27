import { api } from '../api.js';

/**
 * Service for managing APIs and test cases
 */
export const apiService = {
  /**
   * Validate API structure and return any errors
   * @param {Object} apiData - API data to validate
   * @returns {Object} Object with isValid flag and errors array
   */
  validateApi(apiData) {
    const errors = [];

    // Check required fields
    if (!apiData.name) errors.push('API name is required');
    if (!apiData.method) errors.push('HTTP method is required');
    if (!apiData.endpoint) errors.push('API endpoint is required');

    // Validate method
    const validMethods = [
      'GET',
      'POST',
      'PUT',
      'DELETE',
      'PATCH',
      'OPTIONS',
      'HEAD',
    ];
    if (
      apiData.method &&
      !validMethods.includes(apiData.method.toUpperCase())
    ) {
      errors.push(
        `Invalid HTTP method: ${apiData.method}. Valid methods are: ${validMethods.join(', ')}`
      );
    }

    // Validate headers format if present
    if (apiData.headers && typeof apiData.headers === 'object') {
      Object.entries(apiData.headers).forEach(([key, value]) => {
        if (typeof key !== 'string' || !key.trim()) {
          errors.push('Header keys must be non-empty strings');
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  },

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
   * Save an API (create or update) in a file
   * @param {number} fileId - File ID to save the API in
   * @param {Object} apiData - API data
   * @returns {Promise} Promise with saved API data
   */
  async saveApi(fileId, apiData) {
    try {
      console.log(`Saving API in file ${fileId}:`, apiData);
      const response = await api.post(`/file/${fileId}/api/save`, apiData);
      return response.data;
    } catch (error) {
      console.error('Error saving API:', error);
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
   * Duplicates an API to a new file within the same folder
   * @param {number} fileId - Original file ID containing the API to duplicate
   * @param {string} newApiName - Optional name for the duplicated API
   * @param {boolean} includeCases - Whether to include test cases in the duplication
   * @returns {Promise} Promise with duplication result
   */
  async duplicateApi(fileId, newApiName = null, includeCases = true) {
    try {
      console.log(`Duplicating API from file ${fileId}`);
      const response = await api.post(`/file/${fileId}/api/duplicate`, null, {
        params: {
          include_cases: includeCases,
          new_api_name: newApiName,
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error duplicating API:', error, error.response?.data);
      throw error;
    }
  },

  /**
   * Save a test case (create or update) for an API
   * @param {number} fileId - File ID containing the API
   * @param {Object} testCaseData - Test case data
   * @param {number|null} caseId - Optional test case ID for updates
   * @returns {Promise} Promise with saved test case data
   */
  async saveTestCase(fileId, testCaseData, caseId = null) {
    try {
      console.log(
        `Saving test case for file ${fileId}${caseId ? ` (updating case ${caseId})` : ''}:`,
        testCaseData
      );

      if (!fileId) {
        console.error('Missing fileId when saving test case');
        throw new Error('Missing file ID');
      }

      // Ensure the data structure matches the API schema
      const formattedData = {
        name:
          testCaseData.name || `Test case - ${new Date().toLocaleTimeString()}`,
        headers: testCaseData.headers || {},
        // Keep the body as a string to match FastAPI endpoint expectations
        body: testCaseData.body || null,
        expected: testCaseData.expected || null,
      };

      console.log('Formatted data for API endpoint:', formattedData);

      // Log the API endpoint URL for debugging
      const endpoint = `/file/${fileId}/api/cases/save${caseId ? `?case_id=${caseId}` : ''}`;
      console.log('Saving test case to endpoint:', endpoint);

      const response = await api.post(endpoint, formattedData, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log('Save test case response:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error saving test case:', error);
      if (error.response) {
        console.error('Response data:', error.response.data);
        console.error('Response status:', error.response.status);
        console.error('Response headers:', error.response.headers);
      } else if (error.request) {
        console.error('No response received. Request details:', error.request);
      } else {
        console.error('Error setting up request:', error.message);
      }
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
   * Get detailed test case information by ID
   * @param {number} caseId - Test case ID
   * @returns {Promise} Promise with detailed test case information
   */
  async getTestCaseDetails(caseId) {
    try {
      console.log('Fetching detailed test case information:', caseId);
      const response = await api.get(`/case/${caseId}`);
      return response.data;
    } catch (error) {
      console.error(
        `Error fetching detailed test case information ${caseId}:`,
        error
      );
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

  /**
   * Generate test cases automatically based on API structure
   * @param {number} fileId - File ID containing the API
   * @param {Object} options - Generation options
   * @returns {Promise} Promise with generated test cases
   */
  async generateTestCases(fileId, options = {}) {
    try {
      console.log(
        `Generating test cases for file ${fileId} with options:`,
        options
      );

      // Fetch API details first
      const apiResponse = await this.getApi(fileId);

      if (!apiResponse || !apiResponse.data) {
        throw new Error('Could not fetch API details for test case generation');
      }

      const apiData = apiResponse.data;
      const testCases = [];

      // Generate basic positive test case
      const positiveCase = {
        name: `${apiData.name || 'API'} - Success Case`,
        description: `Automatically generated positive test case for ${apiData.method} ${apiData.endpoint}`,
        request_body: apiData.request_body || {},
        request_headers: { ...apiData.headers },
        expected_status: options.expectedStatus || 200,
        is_positive: true,
        validation_rules: [
          { type: 'status', value: options.expectedStatus || 200 },
          { type: 'response_time', value: 2000 }, // 2 seconds max
        ],
      };

      testCases.push(positiveCase);

      // Generate negative test cases if requested
      if (options.includeNegative) {
        // Invalid auth test case
        const authCase = {
          name: `${apiData.name || 'API'} - Auth Failure`,
          description: 'Test authentication failure scenario',
          request_body: apiData.request_body || {},
          request_headers: {
            ...apiData.headers,
            Authorization: 'Invalid-Token',
          },
          expected_status: 401,
          is_positive: false,
          validation_rules: [
            { type: 'status', value: 401 },
            { type: 'contains', field: 'message', value: 'auth' },
          ],
        };

        // Invalid input test case (for POST/PUT methods)
        if (['POST', 'PUT', 'PATCH'].includes(apiData.method?.toUpperCase())) {
          const invalidInputCase = {
            name: `${apiData.name || 'API'} - Invalid Input`,
            description: 'Test invalid input handling',
            request_body: {},
            request_headers: { ...apiData.headers },
            expected_status: 400,
            is_positive: false,
            validation_rules: [
              { type: 'status', value: 400 },
              { type: 'contains', field: 'message', value: 'invalid' },
            ],
          };

          testCases.push(invalidInputCase);
        }

        testCases.push(authCase);
      }

      // Create all test cases in the backend
      const createdCases = [];
      for (const testCase of testCases) {
        try {
          const result = await this.createTestCase(fileId, testCase);
          createdCases.push(result.data);
        } catch (error) {
          console.error('Error creating generated test case:', error);
        }
      }

      return {
        data: createdCases,
        total: createdCases.length,
        message: `Generated ${createdCases.length} test cases successfully`,
      };
    } catch (error) {
      console.error(`Error generating test cases for file ${fileId}:`, error);
      throw error;
    }
  },

  /**
   * Run batch tests for multiple APIs and generate report
   * @param {Array} fileIds - Array of file IDs to test
   * @param {Object} options - Batch options (optional)
   * @returns {Promise} Promise with batch test results
   */
  async runBatchTests(fileIds, options = {}) {
    try {
      console.log(
        `Running batch tests for files:`,
        fileIds,
        'with options:',
        options
      );

      const batchResults = [];
      const failedTests = [];
      let totalTests = 0;
      let passedTests = 0;

      // Process each file in sequence
      for (const fileId of fileIds) {
        try {
          // Get all test cases for this file
          const testCasesResponse = await this.listTestCases(fileId);
          const testCases = testCasesResponse.data || [];

          if (testCases.length === 0) {
            batchResults.push({
              fileId,
              status: 'skipped',
              message: 'No test cases found for this file',
              results: [],
            });
            continue;
          }

          // Extract case IDs
          const caseIds = testCases.map(testCase => testCase.id);
          totalTests += caseIds.length;

          // Run tests for this file
          const testResponse = await this.runTest(fileId, caseIds);
          const fileResults = testResponse.data || [];

          // Count passed tests
          const filePassed = fileResults.filter(
            result => result.status === 'passed'
          ).length;
          passedTests += filePassed;

          // Add any failures to the failedTests array
          const failures = fileResults
            .filter(result => result.status !== 'passed')
            .map(result => ({
              fileId,
              caseId: result.case_id,
              name: result.name || `Test case ${result.case_id}`,
              error: result.error || 'Test failed',
            }));

          failedTests.push(...failures);

          // Add results for this file
          batchResults.push({
            fileId,
            status: filePassed === fileResults.length ? 'passed' : 'failed',
            message: `${filePassed}/${fileResults.length} tests passed`,
            results: fileResults,
          });
        } catch (error) {
          console.error(`Error running tests for file ${fileId}:`, error);
          batchResults.push({
            fileId,
            status: 'error',
            message:
              error.message || 'An error occurred running tests for this file',
            results: [],
          });
        }
      }

      // Build the final report
      return {
        data: {
          batchResults,
          summary: {
            totalFiles: fileIds.length,
            totalTests,
            passedTests,
            failedTests: totalTests - passedTests,
            successRate:
              totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0,
            failures: failedTests,
          },
        },
        status: 200,
        message: `Batch test run complete. ${passedTests}/${totalTests} tests passed.`,
      };
    } catch (error) {
      console.error('Error running batch tests:', error);
      throw error;
    }
  },

  /**
   * Generate a detailed test report
   * @param {Object} batchResults - Results from runBatchTests
   * @param {Object} options - Report options
   * @returns {Object} Formatted report data
   */
  generateTestReport(batchResults, options = {}) {
    try {
      console.log('Generating test report with options:', options);

      if (!batchResults || !batchResults.data || !batchResults.data.summary) {
        throw new Error('Invalid batch results data');
      }

      const { summary, batchResults: fileResults } = batchResults.data;
      const timestamp = new Date().toISOString();

      // Build detailed report with categorized results
      const report = {
        timestamp,
        summary: {
          ...summary,
          duration: options.duration || 0,
          environment: options.environment || 'development',
        },
        files: fileResults.map(file => ({
          fileId: file.fileId,
          status: file.status,
          testsPassed: file.results.filter(r => r.status === 'passed').length,
          testsTotal: file.results.length,
          results: file.results.map(result => ({
            id: result.case_id,
            name: result.name || `Test case ${result.case_id}`,
            status: result.status,
            duration: result.duration || 0,
            statusCode: result.status_code,
            error: result.error || null,
          })),
        })),
      };

      // Add charts data for visualization if requested
      if (options.includeChartData) {
        // Status distribution data
        report.chartData = {
          statusDistribution: {
            labels: ['Passed', 'Failed', 'Error'],
            data: [
              summary.passedTests,
              summary.failedTests - (summary.errorTests || 0),
              summary.errorTests || 0,
            ],
          },
          responseTimeDistribution:
            this._calculateResponseTimeBuckets(fileResults),
        };
      }

      return report;
    } catch (error) {
      console.error('Error generating test report:', error);
      throw error;
    }
  },

  /**
   * Helper method to calculate response time distribution
   * @private
   */
  _calculateResponseTimeBuckets(fileResults) {
    // Define time buckets in ms
    const buckets = {
      '0-100': 0,
      '101-500': 0,
      '501-1000': 0,
      '1001-2000': 0,
      '2001+': 0,
    };

    // Process all results and count in buckets
    fileResults.forEach(file => {
      file.results.forEach(result => {
        const time = result.duration || 0;

        if (time <= 100) buckets['0-100']++;
        else if (time <= 500) buckets['101-500']++;
        else if (time <= 1000) buckets['501-1000']++;
        else if (time <= 2000) buckets['1001-2000']++;
        else buckets['2001+']++;
      });
    });

    return {
      labels: Object.keys(buckets),
      data: Object.values(buckets),
    };
  },
};
