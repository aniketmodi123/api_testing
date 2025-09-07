/**
 * Backend API Call Service - Centralized approach
 * Handles all API calls through backend for consistency
 */

import { api } from '../api';

export class BackendApiCallService {
  /**
   * Execute API call through backend
   * @param {Object} request - Complete API request data
   * @returns {Promise} - API response from backend
   */
  static async executeApiCall({
    fileId,
    environmentId,
    method = 'GET',
    url,
    headers = {},
    params = {},
    body = null,
    options = {},
  }) {
    try {
      console.log('🎯 Sending API call to backend for processing:', {
        fileId,
        environmentId,
        method,
        url: url?.substring(0, 100) + '...',
      });

      const requestPayload = {
        file_id: fileId,
        environment_id: environmentId,
        method: method,
        url: url,
        headers: headers,
        params: params,
        body: body,
        options: {
          include_folder_headers: true,
          resolve_variables: true,
          validate_response: options.validateResponse || false,
          timeout: options.timeout || 30000,
          ...options,
        },
      };

      // Make single backend call that handles everything
      const response = await api.post('/api/execute-direct', requestPayload);

      console.log('✅ Backend API call completed:', {
        status: response.status,
        responseCode: response.data?.response_code,
      });

      return response.data;
    } catch (error) {
      console.error('❌ Backend API call failed:', error);
      throw error;
    }
  }

  /**
   * Execute API call with validation
   * @param {Object} request - API request with validation schema
   * @returns {Promise} - API response with validation results
   */
  static async executeWithValidation(request) {
    return this.executeApiCall({
      ...request,
      options: {
        ...request.options,
        validateResponse: true,
      },
    });
  }

  /**
   * Execute test case through backend
   * @param {number} fileId - File ID
   * @param {Array} testCaseIds - Test case IDs to run
   * @returns {Promise} - Test execution results
   */
  static async executeTestCases(fileId, testCaseIds = []) {
    try {
      const response = await api.post('/api/run-tests', {
        file_id: fileId,
        test_case_ids: testCaseIds,
      });
      return response.data;
    } catch (error) {
      console.error('❌ Test execution failed:', error);
      throw error;
    }
  }
}
