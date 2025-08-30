import { apiService } from '../services/apiService';

/**
 * Advanced API testing utilities
 */
export const apiTestingUtils = {
  /**
   * Check for common security vulnerabilities in API endpoints
   * @param {number} fileId - File ID containing the API to test
   * @returns {Promise} Promise with vulnerability scan results
   */
  async securityScan(fileId) {
    try {
      const apiResponse = await apiService.getApi(fileId);

      if (!apiResponse || !apiResponse.data) {
        throw new Error('Could not fetch API details for security scan');
      }

      const apiData = apiResponse.data;
      const vulnerabilities = [];

      // Check for common security issues based on API structure

      // 1. Check for unprotected endpoints (no auth)
      if (
        !apiData.headers ||
        !Object.keys(apiData.headers).some(
          h =>
            h.toLowerCase() === 'authorization' ||
            h.toLowerCase() === 'x-api-key' ||
            h.toLowerCase() === 'api-key'
        )
      ) {
        vulnerabilities.push({
          severity: 'HIGH',
          type: 'MISSING_AUTH',
          description: 'Endpoint appears to be missing authentication headers',
          recommendation:
            'Add appropriate authentication headers (Authorization, API Key, etc.)',
        });
      }

      // 2. Check for insecure protocol
      if (apiData.url && apiData.url.startsWith('http://')) {
        vulnerabilities.push({
          severity: 'HIGH',
          type: 'INSECURE_PROTOCOL',
          description: 'API uses unencrypted HTTP protocol',
          recommendation: 'Use HTTPS instead of HTTP for all API endpoints',
        });
      }

      // 3. Check for potential sensitive data in URL parameters
      if (apiData.endpoint && apiData.endpoint.includes('?')) {
        const params = new URLSearchParams(apiData.endpoint.split('?')[1]);
        const sensitiveKeys = [
          'password',
          'token',
          'key',
          'secret',
          'auth',
          'credential',
        ];

        for (const key of params.keys()) {
          if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
            vulnerabilities.push({
              severity: 'CRITICAL',
              type: 'SENSITIVE_DATA_IN_URL',
              description: `Potential sensitive data in URL parameter: ${key}`,
              recommendation:
                'Move sensitive data to request headers or body instead of URL parameters',
            });
          }
        }
      }

      // 4. Check for content security policies
      if (apiData.headers) {
        const hasCSP = Object.keys(apiData.headers).some(
          h => h.toLowerCase() === 'content-security-policy'
        );

        if (!hasCSP) {
          vulnerabilities.push({
            severity: 'MEDIUM',
            type: 'MISSING_CSP',
            description: 'No Content-Security-Policy header found',
            recommendation:
              'Add a Content-Security-Policy header to protect against XSS attacks',
          });
        }
      }

      return {
        apiId: apiData.id,
        apiName: apiData.name,
        vulnerabilities,
        vulnerabilityCount: vulnerabilities.length,
        secureScore: Math.max(0, 100 - vulnerabilities.length * 20),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(
        `Error performing security scan for file ${fileId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Load test an API endpoint with multiple concurrent requests
   * @param {number} fileId - File ID containing the API to test
   * @param {Object} options - Load testing options
   * @returns {Promise} Promise with load test results
   */
  async loadTest(fileId, options = {}) {
    try {
      const requestCount = options.requestCount || 10;
      const concurrency = options.concurrency || 5;
      const delayMs = options.delayMs || 0;

      // Get the API to test
      const apiResponse = await apiService.getApi(fileId);

      if (!apiResponse || !apiResponse.data) {
        throw new Error('Could not fetch API details for load testing');
      }

      // Set up load test parameters based on API details
      const testCase = {
        name: `Load test for ${apiResponse.data.name || 'API'}`,
        description: 'Automatic load testing',
        request_body: apiResponse.data.request_body || {},
        request_headers: { ...apiResponse.data.headers },
        expected_status: 200, // Generally expect successful response
        is_positive: true,
      };

      // Create temporary test case
      const testCaseResponse = await apiService.createTestCase(
        fileId,
        testCase
      );
      const testCaseId = testCaseResponse.data.id;

      // Run tests in batches according to concurrency
      const results = [];
      let successCount = 0;
      let failureCount = 0;
      let totalResponseTime = 0;
      let minResponseTime = Infinity;
      let maxResponseTime = 0;

      // Track start time
      const startTime = Date.now();

      // Process in batches based on concurrency
      for (let i = 0; i < requestCount; i += concurrency) {
        const batchSize = Math.min(concurrency, requestCount - i);
        const batchPromises = [];

        // Create promises for this batch
        for (let j = 0; j < batchSize; j++) {
          batchPromises.push(apiService.runTest(fileId, testCaseId));

          // Add delay if specified
          if (delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }

        // Wait for all promises in this batch
        const batchResults = await Promise.all(batchPromises);

        // Process batch results
        batchResults.forEach(result => {
          const testResult = result.data && result.data[0];

          if (testResult) {
            // Calculate metrics
            const responseTime = testResult.duration || 0;
            totalResponseTime += responseTime;
            minResponseTime = Math.min(minResponseTime, responseTime);
            maxResponseTime = Math.max(maxResponseTime, responseTime);

            if (testResult.status === 'passed') {
              successCount++;
            } else {
              failureCount++;
            }

            results.push(testResult);
          }
        });
      }

      // Calculate total duration
      const totalDuration = Date.now() - startTime;

      // Clean up - delete temporary test case
      try {
        await apiService.deleteTestCase(testCaseId);
      } catch (error) {
        console.warn('Error cleaning up temporary test case:', error);
      }

      // Calculate metrics
      const avgResponseTime =
        results.length > 0 ? totalResponseTime / results.length : 0;
      const requestsPerSecond =
        results.length > 0
          ? (results.length / (totalDuration / 1000)).toFixed(2)
          : 0;

      // Return load test report
      return {
        apiId: apiResponse.data.id,
        apiName: apiResponse.data.name,
        totalRequests: results.length,
        successCount,
        failureCount,
        successRate:
          results.length > 0
            ? ((successCount / results.length) * 100).toFixed(1)
            : 0,
        duration: totalDuration,
        avgResponseTime,
        minResponseTime: minResponseTime === Infinity ? 0 : minResponseTime,
        maxResponseTime,
        requestsPerSecond,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`Error performing load test for file ${fileId}:`, error);
      throw error;
    }
  },

  /**
   * Compare two API responses for data consistency
   * @param {Object} response1 - First API response
   * @param {Object} response2 - Second API response
   * @param {Object} options - Comparison options
   * @returns {Object} Comparison results
   */
  compareResponses(response1, response2, options = {}) {
    try {
      const differences = [];
      let matchPercentage = 100;

      // Helper function to recursively compare objects
      const compareObjects = (obj1, obj2, path = '') => {
        // If paths to ignore are specified and current path matches, skip comparison
        if (
          options.ignorePaths &&
          options.ignorePaths.some(p => path === p || path.startsWith(`${p}.`))
        ) {
          return;
        }

        // Get all keys from both objects
        const allKeys = [
          ...new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]),
        ];

        // Check each key
        for (const key of allKeys) {
          const newPath = path ? `${path}.${key}` : key;

          // Skip if this key path should be ignored
          if (
            options.ignorePaths &&
            options.ignorePaths.some(
              p => newPath === p || newPath.startsWith(`${p}.`)
            )
          ) {
            continue;
          }

          const val1 = obj1?.[key];
          const val2 = obj2?.[key];

          // Check if key exists in both objects
          if (!(key in obj1)) {
            differences.push({
              path: newPath,
              type: 'missing_in_first',
              value2: val2,
            });
            continue;
          }

          if (!(key in obj2)) {
            differences.push({
              path: newPath,
              type: 'missing_in_second',
              value1: val1,
            });
            continue;
          }

          // Compare values based on type
          if (typeof val1 !== typeof val2) {
            differences.push({
              path: newPath,
              type: 'type_mismatch',
              value1: typeof val1,
              value2: typeof val2,
            });
          } else if (
            typeof val1 === 'object' &&
            val1 !== null &&
            val2 !== null
          ) {
            // Recursively compare nested objects
            compareObjects(val1, val2, newPath);
          } else if (val1 !== val2) {
            // For primitive values, directly compare
            differences.push({
              path: newPath,
              type: 'value_mismatch',
              value1: val1,
              value2: val2,
            });
          }
        }
      };

      // Start recursive comparison
      compareObjects(response1, response2);

      // Calculate match percentage
      if (differences.length > 0) {
        // Count total number of properties (approximate)
        let totalProps = 0;

        const countProps = (obj, path = '') => {
          if (!obj || typeof obj !== 'object') return;

          for (const key of Object.keys(obj)) {
            const newPath = path ? `${path}.${key}` : key;
            totalProps++;

            if (obj[key] && typeof obj[key] === 'object') {
              countProps(obj[key], newPath);
            }
          }
        };

        countProps(response1);

        // Calculate match percentage
        matchPercentage = Math.max(
          0,
          100 - (differences.length / Math.max(1, totalProps)) * 100
        ).toFixed(1);
      }

      return {
        matches: differences.length === 0,
        matchPercentage: parseFloat(matchPercentage),
        differencesCount: differences.length,
        differences: differences.slice(0, options.maxDifferences || 100),
      };
    } catch (error) {
      console.error('Error comparing API responses:', error);
      throw error;
    }
  },
};
