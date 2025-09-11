import { createContext, useContext, useEffect, useState } from 'react';
import { workspaceService } from '../services/workspaceService';

// Create context with default values
const WorkspaceContext = createContext({
  workspaces: [],
  activeWorkspace: null,
  setActiveWorkspace: () => {},
  workspaceTree: null,
  loading: false,
  error: null,
  createWorkspace: () => {},
  updateWorkspace: () => {},
  deleteWorkspace: () => {},
  refreshWorkspaces: () => {},
  setShouldLoadWorkspaces: () => {},
  shouldLoadWorkspaces: true,
});

export function WorkspaceProvider({ children }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [workspaceTree, setWorkspaceTree] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [shouldLoadWorkspaces, setShouldLoadWorkspaces] = useState(true);

  // Load workspaces from API only when enabled
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 3;
    let retryTimeout;

    // Implement retry with exponential backoff
    const retryWithBackoff = () => {
      if (retryCount < maxRetries) {
        // Exponential backoff - wait longer between each retry
        const delay = Math.pow(2, retryCount) * 1000;

        clearTimeout(retryTimeout);
        retryTimeout = setTimeout(() => {
          retryCount++;
          fetchWorkspaces();
        }, delay);
      } else {
        console.error('Max retries reached. Could not load workspaces.');
        setLoading(false);
        setError('Failed to load workspaces after multiple attempts.');

        // For development/demo: fallback to sample data after retries
        const sampleWorkspaces = [
          { id: 1, name: 'Personal Workspace' },
          { id: 2, name: 'Team Workspace' },
        ];
        setWorkspaces(sampleWorkspaces);
        if (!activeWorkspace) {
          setActiveWorkspace(sampleWorkspaces[0]);
        }
      }
    };

    const fetchWorkspaces = async () => {
      // Only fetch workspaces when explicitly enabled
      if (!shouldLoadWorkspaces) {
        setLoading(false);
        return;
      }

      // If no auth token is present, avoid calling protected endpoints which will 401
      const storedToken = localStorage.getItem('token');
      if (!storedToken) {
        console.debug(
          '[WorkspaceProvider] No auth token found in localStorage; skipping workspace fetch'
        );
        setLoading(false);
        setWorkspaces([]);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const data = await workspaceService.getWorkspaces();

        if (data && Array.isArray(data.data)) {
          setWorkspaces(data.data);

          // Set first workspace as active if none is selected
          if (!activeWorkspace && data.data.length > 0) {
            setActiveWorkspace(data.data[0]);
          }
          // Reset retry count on success
          retryCount = 0;
        } else {
          console.error('Invalid workspace data format:', data);
          setWorkspaces([]);
          retryWithBackoff();
        }
      } catch (err) {
        console.error('Error fetching workspaces:', err);
        setError('Failed to load workspaces. Retrying...');
        retryWithBackoff();
      } finally {
        // Only set loading to false if we're not in a retry cycle
        if (retryCount === 0) {
          setLoading(false);
        }
      }
    };

    fetchWorkspaces();

    // Cleanup function to clear any pending timeouts
    return () => {
      clearTimeout(retryTimeout);
    };
  }, [refreshTrigger, shouldLoadWorkspaces, activeWorkspace]);

  // Load workspace tree when active workspace changes and workspaces are enabled
  useEffect(() => {
    const fetchWorkspaceTree = async () => {
      if (!activeWorkspace || !shouldLoadWorkspaces) {
        setWorkspaceTree(null);
        return;
      }

      try {
        setLoading(true);
        const data = await workspaceService.getWorkspaceTree(
          activeWorkspace.id
        );
        setWorkspaceTree(data.data);
      } catch (err) {
        console.error(
          'Error fetching workspace tree:',
          err,
          'for workspace:',
          activeWorkspace
        );
        // For development/demo: fallback to sample tree
        setWorkspaceTree({
          collections: [
            {
              id: 1,
              name: 'Sample Collection',
              items: [
                {
                  id: 101,
                  type: 'request',
                  name: 'Get Users',
                  method: 'GET',
                  url: 'https://api.example.com/users',
                },
                {
                  id: 102,
                  type: 'folder',
                  name: 'Authentication',
                  items: [
                    {
                      id: 201,
                      type: 'request',
                      name: 'Login',
                      method: 'POST',
                      url: 'https://api.example.com/login',
                    },
                  ],
                },
              ],
            },
          ],
        });
      } finally {
        setLoading(false);
      }
    };

    fetchWorkspaceTree();
  }, [activeWorkspace, refreshTrigger, shouldLoadWorkspaces]);

  // Create a new workspace
  const createWorkspace = async workspaceData => {
    try {
      setLoading(true);
      const result = await workspaceService.createWorkspace(workspaceData);
      setRefreshTrigger(prev => prev + 1); // Trigger refresh
      return result;
    } catch (err) {
      console.error('Error creating workspace:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Update a workspace
  const updateWorkspace = async (workspaceId, workspaceData) => {
    try {
      setLoading(true);
      const result = await workspaceService.updateWorkspace(
        workspaceId,
        workspaceData
      );
      setRefreshTrigger(prev => prev + 1); // Trigger refresh
      return result;
    } catch (err) {
      console.error('Error updating workspace:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Delete a workspace
  const deleteWorkspace = async workspaceId => {
    try {
      setLoading(true);
      await workspaceService.deleteWorkspace(workspaceId);

      // If deleted workspace was active, set first available workspace as active
      if (activeWorkspace && activeWorkspace.id === workspaceId) {
        const remainingWorkspaces = workspaces.filter(
          w => w.id !== workspaceId
        );
        if (remainingWorkspaces.length > 0) {
          setActiveWorkspace(remainingWorkspaces[0]);
        } else {
          setActiveWorkspace(null);
        }
      }

      setRefreshTrigger(prev => prev + 1); // Trigger refresh
      return true;
    } catch (err) {
      console.error('Error deleting workspace:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        activeWorkspace,
        setActiveWorkspace,
        workspaceTree,
        setWorkspaceTree, // <-- expose setter
        loading,
        error,
        createWorkspace,
        updateWorkspace,
        deleteWorkspace,
        refreshWorkspaces: () => setRefreshTrigger(prev => prev + 1),
        setShouldLoadWorkspaces,
        shouldLoadWorkspaces,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  return context;
}
