/**
 * Local Variable Resolver - Handles variable resolution without API calls
 * Supports variables in URLs, headers, body, params, and any text
 */

export class VariableResolver {
  /**
   * Resolve variables in a text string using environment variables
   * @param {string} text - Text containing {{variable}} syntax
   * @param {Array} environmentVariables - Array of {key, value} objects
   * @returns {Object} - {resolved_text, original_text, variables_found, variables_missing}
   */
  static resolveText(text, environmentVariables = []) {
    if (!text || typeof text !== 'string') {
      return {
        resolved_text: text,
        original_text: text,
        variables_found: [],
        variables_missing: [],
      };
    }

    // Create a map for faster lookups
    const variableMap = {};
    if (environmentVariables) {
      environmentVariables.forEach(variable => {
        if (variable && variable.key) {
          variableMap[variable.key] = variable.value || '';
        }
      });
    }

    const variables_found = [];
    const variables_missing = [];

    // Find all variables in the text
    const variableRegex = /\{\{([^}]+)\}\}/g;
    let match;
    const foundVariables = new Set();

    // First pass: identify all variables
    while ((match = variableRegex.exec(text)) !== null) {
      const variableName = match[1].trim();
      foundVariables.add(variableName);
    }

    // Categorize variables as found or missing
    foundVariables.forEach(variableName => {
      if (variableMap.hasOwnProperty(variableName)) {
        variables_found.push(variableName);
      } else {
        variables_missing.push(variableName);
      }
    });

    // Second pass: replace variables with their values
    let resolved_text = text;
    foundVariables.forEach(variableName => {
      const variablePattern = new RegExp(
        `\\{\\{\\s*${variableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`,
        'g'
      );

      if (variableMap.hasOwnProperty(variableName)) {
        resolved_text = resolved_text.replace(
          variablePattern,
          variableMap[variableName]
        );
      } else {
        // Keep the variable syntax if not found
        // resolved_text = resolved_text.replace(variablePattern, `{{${variableName}}}`);
      }
    });

    return {
      resolved_text,
      original_text: text,
      variables_found,
      variables_missing,
    };
  }

  /**
   * Resolve variables in headers object
   * @param {Object} headers - Headers object with string values
   * @param {Array} environmentVariables - Array of {key, value} objects
   * @returns {Object} - Resolved headers object
   */
  static resolveHeaders(headers, environmentVariables = []) {
    if (!headers || typeof headers !== 'object') {
      return {};
    }

    const resolvedHeaders = {};

    Object.entries(headers).forEach(([key, value]) => {
      // Resolve both key and value
      const resolvedKey = this.resolveText(
        key,
        environmentVariables
      ).resolved_text;
      const resolvedValue = this.resolveText(
        String(value),
        environmentVariables
      ).resolved_text;

      resolvedHeaders[resolvedKey] = resolvedValue;
    });

    return resolvedHeaders;
  }

  /**
   * Resolve variables in query parameters object
   * @param {Object} params - Query parameters object
   * @param {Array} environmentVariables - Array of {key, value} objects
   * @returns {Object} - Resolved parameters object
   */
  static resolveParams(params, environmentVariables = []) {
    if (!params || typeof params !== 'object') {
      return {};
    }

    const resolvedParams = {};

    Object.entries(params).forEach(([key, value]) => {
      // Resolve both key and value
      const resolvedKey = this.resolveText(
        key,
        environmentVariables
      ).resolved_text;
      const resolvedValue = this.resolveText(
        String(value),
        environmentVariables
      ).resolved_text;

      resolvedParams[resolvedKey] = resolvedValue;
    });

    return resolvedParams;
  }

  /**
   * Resolve variables in request body
   * @param {string|Object} body - Request body (string or object)
   * @param {Array} environmentVariables - Array of {key, value} objects
   * @returns {string|Object} - Resolved body
   */
  static resolveBody(body, environmentVariables = []) {
    if (!body) {
      return body;
    }

    if (typeof body === 'string') {
      return this.resolveText(body, environmentVariables).resolved_text;
    }

    if (typeof body === 'object') {
      try {
        // Convert object to JSON string, resolve variables, then parse back
        const bodyString = JSON.stringify(body);
        const resolvedString = this.resolveText(
          bodyString,
          environmentVariables
        ).resolved_text;
        return JSON.parse(resolvedString);
      } catch (error) {
        console.warn('Error resolving variables in JSON body:', error);
        return body;
      }
    }

    return body;
  }

  /**
   * Resolve variables in complete API request object
   * @param {Object} apiRequest - Complete API request object
   * @param {Array} environmentVariables - Array of {key, value} objects
   * @returns {Object} - Completely resolved API request
   */
  static resolveApiRequest(apiRequest, environmentVariables = []) {
    if (!apiRequest || typeof apiRequest !== 'object') {
      return apiRequest;
    }

    const resolved = { ...apiRequest };

    // Resolve URL/endpoint
    if (resolved.url) {
      resolved.url = this.resolveText(
        resolved.url,
        environmentVariables
      ).resolved_text;
    }
    if (resolved.endpoint) {
      resolved.endpoint = this.resolveText(
        resolved.endpoint,
        environmentVariables
      ).resolved_text;
    }

    // Resolve headers
    if (resolved.headers) {
      resolved.headers = this.resolveHeaders(
        resolved.headers,
        environmentVariables
      );
    }

    // Resolve query parameters
    if (resolved.params) {
      resolved.params = this.resolveParams(
        resolved.params,
        environmentVariables
      );
    }
    if (resolved.queryParams) {
      resolved.queryParams = this.resolveParams(
        resolved.queryParams,
        environmentVariables
      );
    }

    // Resolve request body
    if (resolved.request_body) {
      resolved.request_body = this.resolveBody(
        resolved.request_body,
        environmentVariables
      );
    }
    if (resolved.body) {
      resolved.body = this.resolveBody(resolved.body, environmentVariables);
    }

    // Resolve any other string fields that might contain variables
    Object.keys(resolved).forEach(key => {
      if (
        typeof resolved[key] === 'string' &&
        !['url', 'endpoint', 'request_body', 'body'].includes(key) &&
        resolved[key].includes('{{')
      ) {
        resolved[key] = this.resolveText(
          resolved[key],
          environmentVariables
        ).resolved_text;
      }
    });

    return resolved;
  }

  /**
   * Get variable information from text (for UI highlighting/tooltips)
   * @param {string} text - Text to analyze
   * @param {Array} environmentVariables - Array of {key, value} objects
   * @returns {Array} - Array of variable info objects
   */
  static getVariableInfo(text, environmentVariables = []) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const variableMap = {};
    if (environmentVariables) {
      environmentVariables.forEach(variable => {
        if (variable && variable.key) {
          variableMap[variable.key] = variable.value || '';
        }
      });
    }

    const variables = [];
    const variableRegex = /\{\{([^}]+)\}\}/g;
    let match;

    while ((match = variableRegex.exec(text)) !== null) {
      const variableName = match[1].trim();
      const startIndex = match.index;
      const endIndex = match.index + match[0].length;

      variables.push({
        name: variableName,
        value: variableMap[variableName] || null,
        found: variableMap.hasOwnProperty(variableName),
        startIndex,
        endIndex,
        fullMatch: match[0],
      });
    }

    return variables;
  }

  /**
   * Check if text contains any variables
   * @param {string} text - Text to check
   * @returns {boolean} - True if text contains variables
   */
  static hasVariables(text) {
    if (!text || typeof text !== 'string') {
      return false;
    }
    return /\{\{[^}]+\}\}/.test(text);
  }

  /**
   * Extract all variable names from text
   * @param {string} text - Text to analyze
   * @returns {Array} - Array of variable names
   */
  static extractVariableNames(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const variables = [];
    const variableRegex = /\{\{([^}]+)\}\}/g;
    let match;

    while ((match = variableRegex.exec(text)) !== null) {
      const variableName = match[1].trim();
      if (!variables.includes(variableName)) {
        variables.push(variableName);
      }
    }

    return variables;
  }
}

export default VariableResolver;
