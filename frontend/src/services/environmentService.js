import { api } from '../api';

/**
 * Environment Service - Handles all environment and variable operations
 * Follows the backend API documentation for environment management
 */

export class EnvironmentService {
  /**
   * Environment Management APIs
   */

  // Create a new environment
  static async createEnvironment(workspaceId, environmentData) {
    try {
      const response = await api.post(
        `/environment/workspace/${workspaceId}/environments`,
        environmentData
      );
      // Handle backend response wrapper format: { response_code: 200, data: ... }
      return response.data?.data || response.data;
    } catch (error) {
      console.error('Error creating environment:', error);
      throw error;
    }
  }

  // Create environment from template
  static async createEnvironmentFromTemplate(
    workspaceId,
    templateName,
    customData = {}
  ) {
    try {
      console.log('🎯 Template creation data:', { templateName, customData });

      // Get the template data
      const templates = this.getAvailableTemplates();
      const template = templates.find(t => t.name === templateName);

      if (!template) {
        throw new Error(`Template '${templateName}' not found`);
      }

      // Convert template variables to the format expected by backend (simple key-value pairs)
      const variables = {};
      template.variables.forEach(variable => {
        variables[variable.key] = variable.value;
      });

      // Create environment data from template, but allow custom overrides
      // Use explicit checks to ensure empty strings are preserved
      const environmentData = {
        name:
          customData.name !== undefined && customData.name !== null
            ? customData.name
            : template.displayName,
        description:
          customData.description !== undefined &&
          customData.description !== null
            ? customData.description
            : template.description,
        is_active:
          customData.is_active !== undefined ? customData.is_active : false,
        variables: variables,
      };

      console.log('📦 Final environment data being sent:', environmentData);

      try {
        const response = await api.post(
          `/environment/workspace/${workspaceId}/environments`,
          environmentData
        );
        // Handle backend response wrapper format: { response_code: 200, data: ... }
        return response.data?.data || response.data;
      } catch (error) {
        // If it's a name conflict error, try with a timestamped name
        if (
          error.response?.status === 400 &&
          error.response?.data?.error_message?.includes('already exists')
        ) {
          const timestamp = new Date()
            .toLocaleString('en-US', {
              month: 'short',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })
            .replace(',', '');

          environmentData.name = `${environmentData.name} (${timestamp})`;

          const retryResponse = await api.post(
            `/environment/workspace/${workspaceId}/environments`,
            environmentData
          );
          return retryResponse.data?.data || retryResponse.data;
        }

        // Re-throw the original error if it's not a name conflict
        throw error;
      }
    } catch (error) {
      console.error('Error creating environment from template:', error);
      throw error;
    }
  } // List all environments in a workspace
  static async listEnvironments(workspaceId) {
    try {
      const response = await api.get(
        `/environment/workspace/${workspaceId}/environments`
      );
      // Handle backend response wrapper format: { response_code: 200, data: ... }
      return response.data?.data || response.data;
    } catch (error) {
      console.error('Error fetching environments:', error);
      throw error;
    }
  } // Get specific environment
  static async getEnvironment(workspaceId, environmentId) {
    try {
      const response = await api.get(
        `/environment/workspace/${workspaceId}/environments/${environmentId}`
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching environment:', error);
      throw error;
    }
  }

  // Update environment
  static async updateEnvironment(workspaceId, environmentId, updateData) {
    try {
      const response = await api.put(
        `/environment/workspace/${workspaceId}/environments/${environmentId}`,
        updateData
      );
      // Handle backend response wrapper format: { response_code: 200, data: ... }
      return response.data?.data || response.data;
    } catch (error) {
      console.error('Error updating environment:', error);
      throw error;
    }
  }

  // Activate environment
  static async activateEnvironment(workspaceId, environmentId) {
    try {
      const response = await api.post(
        `/environment/workspace/${workspaceId}/environments/${environmentId}/activate`
      );
      // Handle backend response wrapper format: { response_code: 200, data: ... }
      return response.data?.data || response.data;
    } catch (error) {
      console.error('Error activating environment:', error);
      throw error;
    }
  }

  // Delete environment
  static async deleteEnvironment(workspaceId, environmentId) {
    try {
      const response = await api.delete(
        `/environment/workspace/${workspaceId}/environments/${environmentId}`
      );
      return response.data;
    } catch (error) {
      console.error('Error deleting environment:', error);
      throw error;
    }
  }

  /**
   * Variable Management APIs
   */

  // Create variable
  static async createVariable(workspaceId, environmentId, variableData) {
    try {
      const response = await api.post(
        `/environment/workspace/${workspaceId}/environments/${environmentId}/variables`,
        variableData
      );
      return response.data;
    } catch (error) {
      console.error('Error creating variable:', error);
      throw error;
    }
  }

  // List variables
  static async listVariables(workspaceId, environmentId) {
    try {
      const response = await api.get(
        `/environment/workspace/${workspaceId}/environments/${environmentId}/variables`
      );
      // Handle backend response wrapper format: { response_code: 200, data: ... }
      return response.data?.data || response.data;
    } catch (error) {
      console.error('Error fetching variables:', error);
      throw error;
    }
  }

  // Get specific variable
  static async getVariable(workspaceId, environmentId, variableId) {
    try {
      const response = await api.get(
        `/environment/workspace/${workspaceId}/environments/${environmentId}/variables/${variableId}`
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching variable:', error);
      throw error;
    }
  }

  // Update variable
  static async updateVariable(
    workspaceId,
    environmentId,
    variableId,
    updateData
  ) {
    try {
      const response = await api.put(
        `/environment/workspace/${workspaceId}/environments/${environmentId}/variables/${variableId}`,
        updateData
      );
      return response.data;
    } catch (error) {
      console.error('Error updating variable:', error);
      throw error;
    }
  }

  // Delete variable
  static async deleteVariable(workspaceId, environmentId, variableId) {
    try {
      const response = await api.delete(
        `/environment/workspace/${workspaceId}/environments/${environmentId}/variables/${variableId}`
      );
      return response.data;
    } catch (error) {
      console.error('Error deleting variable:', error);
      throw error;
    }
  }

  // Save variables (unified create/update endpoint)
  static async saveVariables(workspaceId, environmentId, variablesData) {
    try {
      // Convert from array format to simple key-value format expected by backend
      const variables = {};
      variablesData.forEach(variable => {
        variables[variable.key] = variable.value;
      });

      const response = await api.post(
        `/environment/workspace/${workspaceId}/environments/${environmentId}/variables`,
        { variables }
      );
      return response.data?.data || response.data;
    } catch (error) {
      console.error('Error saving variables:', error);
      throw error;
    }
  }

  /**
   * Variable Resolution APIs
   */

  // Get active environment variables
  static async getActiveEnvironmentVariables(workspaceId) {
    try {
      const response = await api.get(
        `/environment/workspace/${workspaceId}/environments/active/variables`
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching active environment variables:', error);
      throw error;
    }
  }

  // Get resolved variables for specific environment
  static async getResolvedVariables(workspaceId, environmentId) {
    try {
      const response = await api.get(
        `/environment/workspace/${workspaceId}/environments/${environmentId}/variables/resolved`
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching resolved variables:', error);
      throw error;
    }
  }

  // Resolve variables in text (with active environment)
  static async resolveVariables(workspaceId, text, environmentId = null) {
    try {
      const requestData = { text };
      if (environmentId) {
        requestData.environment_id = environmentId;
      }

      const response = await api.post(
        `/environment/workspace/${workspaceId}/environments/resolve`,
        requestData
      );
      // Handle backend response wrapper format: { response_code: 200, data: ... }
      return response.data?.data || response.data;
    } catch (error) {
      console.error('Error resolving variables:', error);
      throw error;
    }
  }

  // Resolve variables with specific environment
  static async resolveVariablesWithEnvironment(
    workspaceId,
    environmentId,
    text
  ) {
    try {
      const response = await api.post(
        `/environment/workspace/${workspaceId}/environments/${environmentId}/resolve`,
        { text }
      );
      return response.data;
    } catch (error) {
      console.error('Error resolving variables with environment:', error);
      throw error;
    }
  }

  /**
   * Frontend Utility Methods
   */

  // Resolve all variables in an API request object
  static async resolveApiRequest(
    workspaceId,
    apiRequest,
    environmentId = null
  ) {
    try {
      const resolvedRequest = { ...apiRequest };

      // Resolve URL
      if (resolvedRequest.url) {
        const urlResult = await this.resolveVariables(
          workspaceId,
          resolvedRequest.url,
          environmentId
        );
        resolvedRequest.url = urlResult.resolved_text;
      }

      // Resolve headers
      if (resolvedRequest.headers) {
        const resolvedHeaders = {};
        for (const [key, value] of Object.entries(resolvedRequest.headers)) {
          const keyResult = await this.resolveVariables(
            workspaceId,
            key,
            environmentId
          );
          const valueResult = await this.resolveVariables(
            workspaceId,
            String(value),
            environmentId
          );
          resolvedHeaders[keyResult.resolved_text] = valueResult.resolved_text;
        }
        resolvedRequest.headers = resolvedHeaders;
      }

      // Resolve params
      if (resolvedRequest.params) {
        const resolvedParams = {};
        for (const [key, value] of Object.entries(resolvedRequest.params)) {
          const keyResult = await this.resolveVariables(
            workspaceId,
            key,
            environmentId
          );
          const valueResult = await this.resolveVariables(
            workspaceId,
            String(value),
            environmentId
          );
          resolvedParams[keyResult.resolved_text] = valueResult.resolved_text;
        }
        resolvedRequest.params = resolvedParams;
      }

      // Resolve body (if it's a string)
      if (resolvedRequest.request_body) {
        if (typeof resolvedRequest.request_body === 'string') {
          const bodyResult = await this.resolveVariables(
            workspaceId,
            resolvedRequest.request_body,
            environmentId
          );
          resolvedRequest.request_body = bodyResult.resolved_text;
        } else if (typeof resolvedRequest.request_body === 'object') {
          // For JSON objects, stringify, resolve, then parse back
          const bodyString = JSON.stringify(resolvedRequest.request_body);
          const bodyResult = await this.resolveVariables(
            workspaceId,
            bodyString,
            environmentId
          );
          try {
            resolvedRequest.request_body = JSON.parse(bodyResult.resolved_text);
          } catch (e) {
            // If parsing fails, keep the resolved string
            resolvedRequest.request_body = bodyResult.resolved_text;
          }
        }
      }

      return resolvedRequest;
    } catch (error) {
      console.error('Error resolving API request:', error);
      // Return original request if resolution fails
      return apiRequest;
    }
  }

  // Extract variables from text (frontend helper)
  static extractVariables(text) {
    const variableRegex = /\{\{([^}]+)\}\}/g;
    const variables = [];
    let match;

    while ((match = variableRegex.exec(text)) !== null) {
      const variableName = match[1].trim();
      if (!variables.includes(variableName)) {
        variables.push(variableName);
      }
    }

    return variables;
  }

  // Validate variable key (frontend validation)
  static validateVariableKey(key) {
    // Must start with letter or underscore
    // Can contain: letters, numbers, underscores, hyphens
    const keyRegex = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
    return keyRegex.test(key);
  }

  // Get available templates
  static getAvailableTemplates() {
    return [
      {
        name: 'api_testing',
        displayName: 'API Testing',
        description: 'Common variables for API testing',
        variables: [
          {
            key: 'devurl',
            value: 'http://localhost:8000',
          },
          {
            key: 'surl',
            value: 'http://example.com',
          },
          {
            key: 'stageurl',
            value: 'http://stage.example.com',
          },
          {
            key: 'username',
            value: 'aniket modi',
          },
        ],
      },
      {
        name: 'development',
        displayName: 'Development',
        description: 'Development environment variables',
        variables: [
          {
            key: 'API_URL',
            value: 'http://localhost:8000',
            description: 'Local development API URL',
          },
          {
            key: 'DEBUG',
            value: 'true',
            description: 'Enable debug mode',
          },
          {
            key: 'DB_HOST',
            value: 'localhost',
            description: 'Database host',
          },
        ],
      },
      {
        name: 'production',
        displayName: 'Production',
        description: 'Production environment variables',
        variables: [
          {
            key: 'API_URL',
            value: 'https://api.yourdomain.com',
            description: 'Production API URL',
          },
          {
            key: 'API_SECRET',
            value: '',
            description: 'Production API secret',
          },
          {
            key: 'DEBUG',
            value: 'false',
            description: 'Disable debug in production',
          },
        ],
      },
    ];
  }
}

export const environmentService = EnvironmentService;
