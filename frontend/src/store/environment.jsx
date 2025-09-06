import { createContext, useContext, useEffect, useState } from 'react';
import { environmentService } from '../services/environmentService';
import { useWorkspace } from './workspace';

const EnvironmentContext = createContext();

export const useEnvironment = () => {
  const context = useContext(EnvironmentContext);
  if (!context) {
    throw new Error(
      'useEnvironment must be used within an EnvironmentProvider'
    );
  }
  return context;
};

export const EnvironmentProvider = ({ children }) => {
  // State management
  const [environments, setEnvironments] = useState([]);
  const [activeEnvironment, setActiveEnvironment] = useState(null);
  const [selectedEnvironment, setSelectedEnvironment] = useState(null);
  const [variables, setVariables] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Get workspace context
  const { activeWorkspace } = useWorkspace();

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Load environments when workspace changes
  useEffect(() => {
    if (activeWorkspace?.id) {
      loadEnvironments();
    } else {
      // Clear environments when no workspace is active
      setEnvironments([]);
      setActiveEnvironment(null);
      setSelectedEnvironment(null);
      setVariables([]);
    }
  }, [activeWorkspace?.id]);

  // Helper function to handle errors
  const handleError = (error, customMessage) => {
    console.error(customMessage, error);
    const errorMessage =
      error.response?.data?.detail || error.message || customMessage;
    setError(errorMessage);
    return false;
  };

  // Helper function to show success messages
  const showSuccess = message => {
    // You can implement toast notifications here
    console.log('✅', message);
  };

  /**
   * Environment Management Functions
   */

  // Load all environments for the current workspace
  const loadEnvironments = async () => {
    if (!activeWorkspace?.id) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await environmentService.listEnvironments(
        activeWorkspace.id
      );
      setEnvironments(data.environments || []);
      setActiveEnvironment(data.active_environment || null);

      // If there's an active environment and no selected environment, select the active one
      if (data.active_environment && !selectedEnvironment) {
        setSelectedEnvironment(data.active_environment);
        await loadVariables(data.active_environment.id);
      }
    } catch (error) {
      handleError(error, 'Failed to load environments');
    } finally {
      setIsLoading(false);
    }
  };

  // Create a new environment
  const createEnvironment = async environmentData => {
    if (!activeWorkspace?.id) return false;

    setIsLoading(true);
    setError(null);

    try {
      const newEnvironment = await environmentService.createEnvironment(
        activeWorkspace.id,
        environmentData
      );

      // Add to environments list
      setEnvironments(prev => [...prev, newEnvironment]);

      // If this is the first environment, select it
      if (environments.length === 0) {
        setSelectedEnvironment(newEnvironment);
        await loadVariables(newEnvironment.id);
      }

      showSuccess(`Environment "${newEnvironment.name}" created successfully`);
      return newEnvironment;
    } catch (error) {
      // Don't set global error for create/update operations - let EnvironmentManager handle it
      console.error('Failed to create environment', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Create environment from template
  const createEnvironmentFromTemplate = async templateName => {
    if (!activeWorkspace?.id) return false;

    setIsLoading(true);
    setError(null);

    try {
      const newEnvironment =
        await environmentService.createEnvironmentFromTemplate(
          activeWorkspace.id,
          templateName
        );

      // Add to environments list
      setEnvironments(prev => [...prev, newEnvironment]);

      // Select the new environment
      setSelectedEnvironment(newEnvironment);
      await loadVariables(newEnvironment.id);

      showSuccess(`Environment "${newEnvironment.name}" created from template`);
      return newEnvironment;
    } catch (error) {
      handleError(error, 'Failed to create environment from template');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Update environment
  const updateEnvironment = async (environmentId, updateData) => {
    if (!activeWorkspace?.id) return false;

    setIsLoading(true);
    setError(null);

    try {
      const updatedEnvironment = await environmentService.updateEnvironment(
        activeWorkspace.id,
        environmentId,
        updateData
      );

      // Update in environments list
      setEnvironments(prev =>
        prev.map(env => (env.id === environmentId ? updatedEnvironment : env))
      );

      // Update selected environment if it's the one being updated
      if (selectedEnvironment?.id === environmentId) {
        setSelectedEnvironment(updatedEnvironment);
      }

      // Update active environment if it changed
      if (updatedEnvironment.is_active) {
        setActiveEnvironment(updatedEnvironment);
        // Deactivate other environments in the list
        setEnvironments(prev =>
          prev.map(env =>
            env.id === environmentId ? env : { ...env, is_active: false }
          )
        );
      }

      showSuccess(
        `Environment "${updatedEnvironment.name}" updated successfully`
      );
      return updatedEnvironment;
    } catch (error) {
      // Don't set global error for create/update operations - let EnvironmentManager handle it
      console.error('Failed to update environment', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Activate environment
  const activateEnvironment = async environmentId => {
    if (!activeWorkspace?.id) return false;

    setIsLoading(true);
    setError(null);

    try {
      const activatedEnvironment = await environmentService.activateEnvironment(
        activeWorkspace.id,
        environmentId
      );

      // Update active environment
      setActiveEnvironment(activatedEnvironment);

      // Update environments list - deactivate others, activate this one
      setEnvironments(prev =>
        prev.map(env => ({
          ...env,
          is_active: env.id === environmentId,
        }))
      );

      showSuccess(`Environment "${activatedEnvironment.name}" is now active`);
      return activatedEnvironment;
    } catch (error) {
      handleError(error, 'Failed to activate environment');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Delete environment
  const deleteEnvironment = async environmentId => {
    if (!activeWorkspace?.id) return false;

    setIsLoading(true);
    setError(null);

    try {
      await environmentService.deleteEnvironment(
        activeWorkspace.id,
        environmentId
      );

      // Remove from environments list
      const environmentToDelete = environments.find(
        env => env.id === environmentId
      );
      setEnvironments(prev => prev.filter(env => env.id !== environmentId));

      // Clear active environment if deleted
      if (activeEnvironment?.id === environmentId) {
        setActiveEnvironment(null);
      }

      // Clear selected environment if deleted
      if (selectedEnvironment?.id === environmentId) {
        setSelectedEnvironment(null);
        setVariables([]);
      }

      showSuccess(
        `Environment "${environmentToDelete?.name}" deleted successfully`
      );
      return true;
    } catch (error) {
      handleError(error, 'Failed to delete environment');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Variable Management Functions
   */

  // Load variables for selected environment
  // Helper function to convert variables dict to array format
  const convertVariablesToArray = variablesDict => {
    if (!variablesDict || typeof variablesDict !== 'object') {
      return [];
    }

    return Object.entries(variablesDict).map(([key, value], index) => ({
      id: index + 1, // Simple ID for React keys
      key,
      value,
      description: '', // No description in simple format
      is_enabled: true, // Always enabled in simple format
    }));
  };

  const loadVariables = async (environmentId = selectedEnvironment?.id) => {
    if (!activeWorkspace?.id || !environmentId) return;

    setIsLoading(true);
    setError(null);

    try {
      const variablesResponse = await environmentService.listVariables(
        activeWorkspace.id,
        environmentId
      );

      // Handle different response formats
      let variablesArray = [];
      if (Array.isArray(variablesResponse)) {
        variablesArray = variablesResponse;
      } else if (
        variablesResponse &&
        typeof variablesResponse.variables === 'object'
      ) {
        // Convert Dict[str, str] to array format
        variablesArray = convertVariablesToArray(variablesResponse.variables);
      } else if (
        variablesResponse &&
        Array.isArray(variablesResponse.variables)
      ) {
        variablesArray = variablesResponse.variables;
      } else if (variablesResponse && Array.isArray(variablesResponse.data)) {
        variablesArray = variablesResponse.data;
      }

      setVariables(variablesArray);
    } catch (error) {
      handleError(error, 'Failed to load variables');
      setVariables([]); // Ensure variables is always an array even on error
    } finally {
      setIsLoading(false);
    }
  };

  // Create variable
  const createVariable = async (
    variableData,
    environmentId = selectedEnvironment?.id
  ) => {
    if (!activeWorkspace?.id || !environmentId) return false;

    setIsLoading(true);
    setError(null);

    try {
      const newVariable = await environmentService.createVariable(
        activeWorkspace.id,
        environmentId,
        variableData
      );

      // Add to variables list if this is the selected environment
      if (environmentId === selectedEnvironment?.id) {
        setVariables(prev => [...prev, newVariable]);
      }

      showSuccess(`Variable "${newVariable.key}" created successfully`);
      return newVariable;
    } catch (error) {
      // Don't set global error for create/update operations - let components handle it
      console.error('Failed to create variable', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Update variable
  const updateVariable = async (
    variableId,
    updateData,
    environmentId = selectedEnvironment?.id
  ) => {
    if (!activeWorkspace?.id || !environmentId) return false;

    setIsLoading(true);
    setError(null);

    try {
      const updatedVariable = await environmentService.updateVariable(
        activeWorkspace.id,
        environmentId,
        variableId,
        updateData
      );

      // Update in variables list if this is the selected environment
      if (environmentId === selectedEnvironment?.id) {
        setVariables(prev =>
          prev.map(variable =>
            variable.id === variableId ? updatedVariable : variable
          )
        );
      }

      showSuccess(`Variable "${updatedVariable.key}" updated successfully`);
      return updatedVariable;
    } catch (error) {
      // Don't set global error for create/update operations - let components handle it
      console.error('Failed to update variable', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Delete variable
  const deleteVariable = async (
    variableId,
    environmentId = selectedEnvironment?.id
  ) => {
    if (!activeWorkspace?.id || !environmentId) return false;

    setIsLoading(true);
    setError(null);

    try {
      const variableToDelete = variables.find(v => v.id === variableId);

      await environmentService.deleteVariable(
        activeWorkspace.id,
        environmentId,
        variableId
      );

      // Remove from variables list if this is the selected environment
      if (environmentId === selectedEnvironment?.id) {
        setVariables(prev =>
          prev.filter(variable => variable.id !== variableId)
        );
      }

      showSuccess(`Variable "${variableToDelete?.key}" deleted successfully`);
      return true;
    } catch (error) {
      handleError(error, 'Failed to delete variable');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Save variables (unified create/update)
  const saveVariables = async (environmentId, variablesData) => {
    if (!activeWorkspace?.id || !environmentId) return false;

    try {
      setIsLoading(true);

      const result = await environmentService.saveVariables(
        activeWorkspace.id,
        environmentId,
        variablesData
      );

      // Use the response data directly instead of calling loadVariables again
      if (result && environmentId === selectedEnvironment?.id) {
        // Convert the response variables dict to array format
        const variablesArray = convertVariablesToArray(result.variables);
        setVariables(variablesArray);
      }

      showSuccess('Variables saved successfully');
      return true;
    } catch (error) {
      handleError(error, 'Failed to save variables');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Variable Resolution Functions
   */

  // Get active environment variables
  const getActiveEnvironmentVariables = async () => {
    if (!activeWorkspace?.id) return null;

    try {
      return await environmentService.getActiveEnvironmentVariables(
        activeWorkspace.id
      );
    } catch (error) {
      handleError(error, 'Failed to get active environment variables');
      return null;
    }
  };

  // Resolve variables in text
  const resolveVariables = async (text, environmentId = null) => {
    if (!activeWorkspace?.id) return null;

    try {
      return await environmentService.resolveVariables(
        activeWorkspace.id,
        text,
        environmentId
      );
    } catch (error) {
      handleError(error, 'Failed to resolve variables');
      return null;
    }
  };

  // Resolve API request
  const resolveApiRequest = async (apiRequest, environmentId = null) => {
    if (!activeWorkspace?.id) return apiRequest;

    try {
      return await environmentService.resolveApiRequest(
        activeWorkspace.id,
        apiRequest,
        environmentId
      );
    } catch (error) {
      handleError(error, 'Failed to resolve API request');
      return apiRequest;
    }
  };

  // Select environment (for editing/viewing)
  const selectEnvironment = async environment => {
    setSelectedEnvironment(environment);
    if (environment) {
      await loadVariables(environment.id);
    } else {
      setVariables([]);
    }
  };

  // Get available templates
  const getAvailableTemplates = () => {
    return environmentService.getAvailableTemplates();
  };

  // Extract variables from text
  const extractVariables = text => {
    return environmentService.extractVariables(text);
  };

  // Validate variable key
  const validateVariableKey = key => {
    return environmentService.validateVariableKey(key);
  };

  const value = {
    // State
    environments,
    activeEnvironment,
    selectedEnvironment,
    variables,
    isLoading,
    error,

    // Environment management
    loadEnvironments,
    createEnvironment,
    createEnvironmentFromTemplate,
    updateEnvironment,
    activateEnvironment,
    deleteEnvironment,
    selectEnvironment,

    // Variable management
    loadVariables,
    createVariable,
    updateVariable,
    deleteVariable,
    saveVariables,

    // Variable resolution
    getActiveEnvironmentVariables,
    resolveVariables,
    resolveApiRequest,

    // Utilities
    getAvailableTemplates,
    extractVariables,
    validateVariableKey,
  };

  return (
    <EnvironmentContext.Provider value={value}>
      {children}
    </EnvironmentContext.Provider>
  );
};
