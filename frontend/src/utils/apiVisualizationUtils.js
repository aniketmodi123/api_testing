/**
 * Utility functions for visualizing API test results
 */
export const apiVisualizationUtils = {
  /**
   * Convert test results to chart-friendly format
   * @param {Object} testResults - API test results
   * @param {string} chartType - Type of chart to generate data for
   * @returns {Object} Formatted chart data
   */
  prepareChartData(testResults, chartType = 'statusDistribution') {
    // Default empty structure
    const defaultData = {
      labels: [],
      datasets: [
        {
          data: [],
          backgroundColor: [],
          borderColor: [],
          borderWidth: 1,
        },
      ],
    };

    if (!testResults || !testResults.data) {
      return defaultData;
    }

    switch (chartType) {
      case 'statusDistribution': {
        // Distribution of pass/fail/error status
        const summary = testResults.data.summary || {};
        return {
          labels: ['Passed', 'Failed', 'Error'],
          datasets: [
            {
              data: [
                summary.passedTests || 0,
                (summary.failedTests || 0) - (summary.errorTests || 0),
                summary.errorTests || 0,
              ],
              backgroundColor: [
                'rgba(75, 192, 192, 0.6)', // Green
                'rgba(255, 159, 64, 0.6)', // Orange
                'rgba(255, 99, 132, 0.6)', // Red
              ],
              borderColor: [
                'rgba(75, 192, 192, 1)',
                'rgba(255, 159, 64, 1)',
                'rgba(255, 99, 132, 1)',
              ],
              borderWidth: 1,
            },
          ],
        };
      }

      case 'responseTimeDistribution': {
        // Response time distribution across buckets
        const fileResults = testResults.data.batchResults || [];
        const buckets = {
          '0-100ms': 0,
          '101-500ms': 0,
          '501-1000ms': 0,
          '1001-2000ms': 0,
          '2000ms+': 0,
        };

        // Calculate buckets
        fileResults.forEach(file => {
          (file.results || []).forEach(result => {
            const time = result.duration || 0;

            if (time <= 100) buckets['0-100ms']++;
            else if (time <= 500) buckets['101-500ms']++;
            else if (time <= 1000) buckets['501-1000ms']++;
            else if (time <= 2000) buckets['1001-2000ms']++;
            else buckets['2000ms+']++;
          });
        });

        return {
          labels: Object.keys(buckets),
          datasets: [
            {
              data: Object.values(buckets),
              backgroundColor: [
                'rgba(75, 192, 192, 0.6)', // Green
                'rgba(75, 192, 192, 0.4)', // Green lighter
                'rgba(255, 205, 86, 0.6)', // Yellow
                'rgba(255, 159, 64, 0.6)', // Orange
                'rgba(255, 99, 132, 0.6)', // Red
              ],
              borderColor: [
                'rgba(75, 192, 192, 1)',
                'rgba(75, 192, 192, 1)',
                'rgba(255, 205, 86, 1)',
                'rgba(255, 159, 64, 1)',
                'rgba(255, 99, 132, 1)',
              ],
              borderWidth: 1,
            },
          ],
        };
      }

      case 'successRateTimeline': {
        // Assuming we have historical data in the format:
        // testResults.data.history = [{date: '2023-01-01', successRate: 95}, ...]
        const history = testResults.data.history || [];

        return {
          labels: history.map(item => item.date || item.timestamp),
          datasets: [
            {
              label: 'Success Rate %',
              data: history.map(item => item.successRate || 0),
              fill: false,
              backgroundColor: 'rgba(75, 192, 192, 0.6)',
              borderColor: 'rgba(75, 192, 192, 1)',
              tension: 0.1,
            },
          ],
        };
      }

      case 'endpointPerformance': {
        // Compare response time across different endpoints
        const fileResults = testResults.data.batchResults || [];
        const endpoints = {};

        // Calculate average response time per API
        fileResults.forEach(file => {
          const apiName = file.apiName || `API ${file.fileId}`;
          const results = file.results || [];

          if (results.length > 0) {
            const totalTime = results.reduce(
              (sum, r) => sum + (r.duration || 0),
              0
            );
            endpoints[apiName] = totalTime / results.length;
          }
        });

        return {
          labels: Object.keys(endpoints),
          datasets: [
            {
              label: 'Avg Response Time (ms)',
              data: Object.values(endpoints),
              backgroundColor: 'rgba(54, 162, 235, 0.6)',
              borderColor: 'rgba(54, 162, 235, 1)',
              borderWidth: 1,
            },
          ],
        };
      }

      default:
        return defaultData;
    }
  },

  /**
   * Generate a summary table from test results
   * @param {Object} testResults - API test results
   * @returns {Array} Table data with headers and rows
   */
  generateSummaryTable(testResults) {
    if (!testResults || !testResults.data) {
      return {
        headers: [],
        rows: [],
      };
    }

    const summary = testResults.data.summary || {};
    const batchResults = testResults.data.batchResults || [];

    // Generate summary table
    return {
      headers: [
        'API',
        'Status',
        'Tests',
        'Passed',
        'Failed',
        'Success Rate',
        'Avg Response Time',
      ],
      rows: batchResults.map(result => {
        const totalTests = result.results?.length || 0;
        const passedTests =
          result.results?.filter(r => r.status === 'passed').length || 0;
        const failedTests = totalTests - passedTests;
        const successRate =
          totalTests > 0
            ? `${((passedTests / totalTests) * 100).toFixed(1)}%`
            : 'N/A';

        // Calculate average response time
        let avgResponseTime = 'N/A';
        if (result.results && result.results.length > 0) {
          const totalTime = result.results.reduce(
            (sum, r) => sum + (r.duration || 0),
            0
          );
          avgResponseTime = `${(totalTime / result.results.length).toFixed(1)}ms`;
        }

        return [
          result.apiName || `API ${result.fileId}`,
          result.status,
          totalTests,
          passedTests,
          failedTests,
          successRate,
          avgResponseTime,
        ];
      }),
    };
  },

  /**
   * Generate HTML report from test results
   * @param {Object} testResults - API test results
   * @returns {string} HTML report content
   */
  generateHtmlReport(testResults) {
    if (!testResults || !testResults.data) {
      return '<h1>No test results available</h1>';
    }

    const summary = testResults.data.summary || {};
    const batchResults = testResults.data.batchResults || [];

    // Create summary section
    const reportDate = new Date().toLocaleString();
    const summaryHtml = `
      <div class="report-summary">
        <h2>Test Summary</h2>
        <div class="summary-stats">
          <div class="stat-box">
            <span class="stat-value">${summary.totalFiles || 0}</span>
            <span class="stat-label">APIs Tested</span>
          </div>
          <div class="stat-box">
            <span class="stat-value">${summary.totalTests || 0}</span>
            <span class="stat-label">Total Tests</span>
          </div>
          <div class="stat-box ${summary.failedTests > 0 ? 'failure' : 'success'}">
            <span class="stat-value">${summary.successRate || 0}%</span>
            <span class="stat-label">Success Rate</span>
          </div>
        </div>
      </div>
    `;

    // Create details section for each API
    let detailsHtml = '';
    batchResults.forEach(result => {
      const totalTests = result.results?.length || 0;
      const passedTests =
        result.results?.filter(r => r.status === 'passed').length || 0;
      const successRate =
        totalTests > 0
          ? `${((passedTests / totalTests) * 100).toFixed(1)}%`
          : 'N/A';

      // Create table rows for test cases
      let testCasesHtml = '';
      if (result.results && result.results.length > 0) {
        result.results.forEach(testCase => {
          testCasesHtml += `
            <tr class="${testCase.status === 'passed' ? 'success' : 'failure'}">
              <td>${testCase.name || `Test case ${testCase.case_id}`}</td>
              <td>${testCase.status}</td>
              <td>${testCase.status_code || 'N/A'}</td>
              <td>${testCase.duration || 0}ms</td>
              <td>${testCase.error || '-'}</td>
            </tr>
          `;
        });
      }

      detailsHtml += `
        <div class="api-detail">
          <h3>${result.apiName || `API ${result.fileId}`}</h3>
          <div class="api-summary">
            <span class="${result.status === 'passed' ? 'success' : 'failure'}">
              Status: ${result.status}
            </span>
            <span>Tests: ${totalTests}</span>
            <span>Success Rate: ${successRate}</span>
          </div>

          <table class="test-cases">
            <thead>
              <tr>
                <th>Test Case</th>
                <th>Status</th>
                <th>HTTP Status</th>
                <th>Response Time</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              ${testCasesHtml || '<tr><td colspan="5">No test cases available</td></tr>'}
            </tbody>
          </table>
        </div>
      `;
    });

    // Put everything together with styling
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>API Test Report</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
          }
          h1, h2, h3 {
            color: #2c3e50;
          }
          .report-header {
            border-bottom: 2px solid #eee;
            margin-bottom: 30px;
            padding-bottom: 10px;
          }
          .report-date {
            color: #7f8c8d;
            font-size: 14px;
          }
          .report-summary {
            background-color: #f9f9f9;
            border-radius: 5px;
            padding: 20px;
            margin-bottom: 30px;
          }
          .summary-stats {
            display: flex;
            justify-content: space-around;
            text-align: center;
            margin-top: 20px;
          }
          .stat-box {
            padding: 15px;
            border-radius: 5px;
            background-color: #ecf0f1;
            width: 150px;
          }
          .stat-value {
            display: block;
            font-size: 28px;
            font-weight: bold;
          }
          .stat-label {
            font-size: 14px;
            color: #7f8c8d;
          }
          .api-detail {
            margin-bottom: 30px;
            border: 1px solid #eee;
            border-radius: 5px;
            padding: 15px;
          }
          .api-summary {
            display: flex;
            gap: 20px;
            margin-bottom: 15px;
          }
          .success {
            color: #27ae60;
          }
          .failure {
            color: #e74c3c;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            text-align: left;
            padding: 12px;
            border-bottom: 1px solid #eee;
          }
          th {
            background-color: #f2f2f2;
          }
          tr.success td {
            background-color: rgba(39, 174, 96, 0.1);
          }
          tr.failure td {
            background-color: rgba(231, 76, 60, 0.1);
          }
        </style>
      </head>
      <body>
        <div class="report-header">
          <h1>API Test Report</h1>
          <p class="report-date">Generated: ${reportDate}</p>
        </div>

        ${summaryHtml}

        <h2>API Details</h2>
        ${detailsHtml || '<p>No API test results available</p>'}
      </body>
      </html>
    `;
  },
};
