import { api } from '../api';

const VAR_META_PREFIX = '__pm_meta__:';

// Encode type+value into the string stored in backend Dict[str, str].
// Format: "__pm_meta__:{"t":"secret","iv":"original"}\nactual_value"
// Falls back to plain string for type=text with no initial_value tracking needed.
function encodeVarMeta(value, type, initialValue) {
  if (!type || type === 'text') return value;
  const meta = { t: type };
  if (initialValue !== undefined && initialValue !== value) meta.iv = initialValue;
  return `${VAR_META_PREFIX}${JSON.stringify(meta)}\n${value}`;
}

function decodeVarMeta(raw) {
  if (typeof raw !== 'string') return { value: String(raw ?? ''), type: 'text', initialValue: null };
  if (!raw.startsWith(VAR_META_PREFIX)) return { value: raw, type: 'text', initialValue: null };
  const newline = raw.indexOf('\n');
  if (newline === -1) return { value: raw, type: 'text', initialValue: null };
  try {
    const meta = JSON.parse(raw.slice(VAR_META_PREFIX.length, newline));
    const value = raw.slice(newline + 1);
    return { value, type: meta.t || 'text', initialValue: meta.iv ?? null };
  } catch {
    return { value: raw, type: 'text', initialValue: null };
  }
}

export class EnvironmentService {
  static async createEnvironment(workspaceId, environmentData) {
    try {
      const response = await api.post(
        `/environment/workspace/${workspaceId}/environments`,
        environmentData
      );
      return response.data?.data || response.data;
    } catch (error) {
      console.error('Error creating environment:', error);
      throw error;
    }
  }

  static async createEnvironmentFromTemplate(workspaceId, templateName, customData = {}) {
    try {
      const templates = this.getAvailableTemplates();
      const template = templates.find(t => t.name === templateName);
      if (!template) throw new Error(`Template '${templateName}' not found`);

      const variables = {};
      template.variables.forEach(variable => {
        variables[variable.key] = variable.value;
      });

      const environmentData = {
        name:
          customData.name !== undefined && customData.name !== null
            ? customData.name
            : template.displayName,
        description:
          customData.description !== undefined && customData.description !== null
            ? customData.description
            : template.description,
        is_active: customData.is_active !== undefined ? customData.is_active : false,
        variables,
      };

      try {
        const response = await api.post(
          `/environment/workspace/${workspaceId}/environments`,
          environmentData
        );
        return response.data?.data || response.data;
      } catch (error) {
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
        throw error;
      }
    } catch (error) {
      console.error('Error creating environment from template:', error);
      throw error;
    }
  }

  static async listEnvironments(workspaceId) {
    try {
      const response = await api.get(
        `/environment/workspace/${workspaceId}/environments`
      );
      return response.data?.data || response.data;
    } catch (error) {
      console.error('Error fetching environments:', error);
      throw error;
    }
  }

  static async getEnvironment(workspaceId, environmentId) {
    try {
      const response = await api.get(
        `/environment/workspace/${workspaceId}/environments/${environmentId}`
      );
      return response.data?.data || response.data;
    } catch (error) {
      console.error('Error fetching environment:', error);
      throw error;
    }
  }

  static async updateEnvironment(workspaceId, environmentId, updateData) {
    try {
      const response = await api.put(
        `/environment/workspace/${workspaceId}/environments/${environmentId}`,
        updateData
      );
      return response.data?.data || response.data;
    } catch (error) {
      console.error('Error updating environment:', error);
      throw error;
    }
  }

  static async activateEnvironment(workspaceId, environmentId) {
    try {
      const response = await api.post(
        `/environment/workspace/${workspaceId}/environments/${environmentId}/activate`
      );
      return response.data?.data || response.data;
    } catch (error) {
      console.error('Error activating environment:', error);
      throw error;
    }
  }

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

  // Duplicate: GET variables from source → POST new env with those variables.
  static async duplicateEnvironment(workspaceId, sourceEnv) {
    try {
      const baseName = `${sourceEnv.name} Copy`;
      let name = baseName;
      let attempt = 1;

      // Fetch source variables
      let variables = {};
      try {
        const varResp = await api.get(
          `/environment/workspace/${workspaceId}/environments/${sourceEnv.id}/variables`
        );
        variables = varResp.data?.data?.variables || varResp.data?.variables || {};
      } catch (_) {
        // empty variables is fine
      }

      while (attempt <= 10) {
        try {
          const response = await api.post(
            `/environment/workspace/${workspaceId}/environments`,
            {
              name,
              description: sourceEnv.description || '',
              is_active: false,
              variables,
            }
          );
          return response.data?.data || response.data;
        } catch (error) {
          if (
            error.response?.status === 400 &&
            error.response?.data?.error_message?.includes('already exists')
          ) {
            attempt += 1;
            name = `${baseName} ${attempt}`;
          } else {
            throw error;
          }
        }
      }
      throw new Error('Could not find a unique name for the duplicate environment');
    } catch (error) {
      console.error('Error duplicating environment:', error);
      throw error;
    }
  }

  static async listVariables(workspaceId, environmentId) {
    try {
      const response = await api.get(
        `/environment/workspace/${workspaceId}/environments/${environmentId}/variables`
      );
      return response.data?.data || response.data;
    } catch (error) {
      console.error('Error fetching variables:', error);
      throw error;
    }
  }

  // Save variables — encodes type metadata into the string value before sending.
  static async saveVariables(workspaceId, environmentId, variablesData) {
    try {
      const variables = {};
      variablesData.forEach(variable => {
        variables[variable.key] = encodeVarMeta(
          variable.value,
          variable.type,
          variable.initialValue
        );
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

  // Decode a raw variables dict from the backend into the array format the UI uses.
  static decodeVariablesDict(rawDict) {
    if (!rawDict || typeof rawDict !== 'object') return [];
    return Object.entries(rawDict).map(([key, raw], index) => {
      const { value, type, initialValue } = decodeVarMeta(raw);
      return {
        id: index + 1,
        key,
        value,
        initialValue: initialValue ?? value,
        type: type || 'text',
        is_enabled: true,
      };
    });
  }

  static async resolveVariables(workspaceId, text, environmentId = null) {
    try {
      const requestData = { text };
      if (environmentId) requestData.environment_id = environmentId;
      const response = await api.post(
        `/environment/workspace/${workspaceId}/environments/resolve`,
        requestData
      );
      return response.data?.data || response.data;
    } catch (error) {
      console.error('Error resolving variables:', error);
      throw error;
    }
  }

  static async resolveApiRequest(workspaceId, apiRequest, environmentId = null) {
    try {
      const resolvedRequest = { ...apiRequest };

      if (resolvedRequest.url) {
        const urlResult = await this.resolveVariables(workspaceId, resolvedRequest.url, environmentId);
        resolvedRequest.url = urlResult.resolved_text;
      }

      if (resolvedRequest.headers) {
        const resolvedHeaders = {};
        for (const [key, value] of Object.entries(resolvedRequest.headers)) {
          const keyResult = await this.resolveVariables(workspaceId, key, environmentId);
          const valueResult = await this.resolveVariables(workspaceId, String(value), environmentId);
          resolvedHeaders[keyResult.resolved_text] = valueResult.resolved_text;
        }
        resolvedRequest.headers = resolvedHeaders;
      }

      if (resolvedRequest.params) {
        const resolvedParams = {};
        for (const [key, value] of Object.entries(resolvedRequest.params)) {
          const keyResult = await this.resolveVariables(workspaceId, key, environmentId);
          const valueResult = await this.resolveVariables(workspaceId, String(value), environmentId);
          resolvedParams[keyResult.resolved_text] = valueResult.resolved_text;
        }
        resolvedRequest.params = resolvedParams;
      }

      if (resolvedRequest.request_body) {
        if (typeof resolvedRequest.request_body === 'string') {
          const bodyResult = await this.resolveVariables(workspaceId, resolvedRequest.request_body, environmentId);
          resolvedRequest.request_body = bodyResult.resolved_text;
        } else if (typeof resolvedRequest.request_body === 'object') {
          const bodyString = JSON.stringify(resolvedRequest.request_body);
          const bodyResult = await this.resolveVariables(workspaceId, bodyString, environmentId);
          try {
            resolvedRequest.request_body = JSON.parse(bodyResult.resolved_text);
          } catch {
            resolvedRequest.request_body = bodyResult.resolved_text;
          }
        }
      }

      return resolvedRequest;
    } catch (error) {
      console.error('Error resolving API request:', error);
      return apiRequest;
    }
  }

  static extractVariables(text) {
    const variableRegex = /\{\{([^}]+)\}\}/g;
    const variables = [];
    let match;
    while ((match = variableRegex.exec(text)) !== null) {
      const variableName = match[1].trim();
      if (!variables.includes(variableName)) variables.push(variableName);
    }
    return variables;
  }

  static validateVariableKey(key) {
    return /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(key);
  }

  static getAvailableTemplates() {
    return [
      {
        name: 'apipilot',
        displayName: 'ApiPilot',
        description: 'Common variables for ApiPilot',
        variables: [
          { key: 'devurl', value: 'http://localhost:8000' },
          { key: 'surl', value: 'http://example.com' },
          { key: 'stageurl', value: 'http://stage.example.com' },
          { key: 'username', value: 'aniket modi' },
        ],
      },
      {
        name: 'development',
        displayName: 'Development',
        description: 'Development environment variables',
        variables: [
          { key: 'API_URL', value: 'http://localhost:8000' },
          { key: 'DEBUG', value: 'true' },
          { key: 'DB_HOST', value: 'localhost' },
        ],
      },
      {
        name: 'production',
        displayName: 'Production',
        description: 'Production environment variables',
        variables: [
          { key: 'API_URL', value: 'https://api.yourdomain.com' },
          { key: 'API_SECRET', value: '' },
          { key: 'DEBUG', value: 'false' },
        ],
      },
    ];
  }
}

export const environmentService = EnvironmentService;
