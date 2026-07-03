import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { workspaceService } from '../services/workspaceService';

// --- Structural sharing -------------------------------------------------------
// The backend returns the FULL workspace tree on every node mutation. Replacing
// state with that response wholesale gives every node a new object reference, so
// React.memo can never skip an unchanged subtree. These helpers merge the new
// tree onto the previous one, reusing the old object reference for any node (and
// any node list) that is structurally unchanged — only changed nodes and their
// ancestors get fresh references.

function _shallowEqualNode(a, b) {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function _mergeNodeList(oldList, newList) {
  if (!Array.isArray(oldList) || !Array.isArray(newList)) return newList;
  const oldById = new Map(oldList.map(node => [node.id, node]));
  let changed = newList.length !== oldList.length;
  const merged = newList.map((node, index) => {
    const mergedNode = _mergeNode(oldById.get(node.id), node);
    if (mergedNode !== oldList[index]) changed = true;
    return mergedNode;
  });
  // Reuse the old array reference when nothing in it moved or changed.
  return changed ? merged : oldList;
}

function _mergeNode(oldNode, newNode) {
  if (!oldNode || !newNode) return newNode;
  let candidate = newNode;
  if (Array.isArray(newNode.children)) {
    const mergedChildren = _mergeNodeList(oldNode.children, newNode.children);
    if (mergedChildren !== newNode.children) {
      candidate = { ...newNode, children: mergedChildren };
    }
  }
  // children is compared by reference here — unchanged subtrees keep their ref.
  return _shallowEqualNode(oldNode, candidate) ? oldNode : candidate;
}

function mergeWorkspaceTrees(prev, next) {
  if (
    !prev ||
    !next ||
    !Array.isArray(prev.file_tree) ||
    !Array.isArray(next.file_tree)
  ) {
    return next;
  }
  return { ...next, file_tree: _mergeNodeList(prev.file_tree, next.file_tree) };
}

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
  const [activeWorkspace, setActiveWorkspace] = useState(() => {
    try {
      const stored = localStorage.getItem('activeWorkspace');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [workspaceTree, setWorkspaceTree] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [shouldLoadWorkspaces, setShouldLoadWorkspaces] = useState(false);

  // Exposed to consumers in place of the raw setter: merges a full-tree mutation
  // response onto the current tree so unchanged node references are preserved
  // (enables React.memo to skip unchanged subtrees in CollectionTree).
  const patchWorkspaceTree = useCallback(next => {
    setWorkspaceTree(prev => mergeWorkspaceTrees(prev, next));
  }, []);

  // Persist activeWorkspace so StrictMode remounts restore it immediately
  useEffect(() => {
    if (activeWorkspace) {
      localStorage.setItem('activeWorkspace', JSON.stringify(activeWorkspace));
    } else {
      localStorage.removeItem('activeWorkspace');
    }
  }, [activeWorkspace]);

  // Auto-enable workspace loading if user is authenticated
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token && !shouldLoadWorkspaces) {
      console.log(
        '[WorkspaceProvider] Auto-enabling workspace loading for authenticated user'
      );
      setShouldLoadWorkspaces(true);
    }
  }, [shouldLoadWorkspaces]);

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
        console.log('[WorkspaceProvider] Fetching workspaces...');
        const data = await workspaceService.getWorkspaces();

        if (data && Array.isArray(data.data)) {
          console.log(
            '[WorkspaceProvider] Workspaces loaded:',
            data.data.length
          );
          setWorkspaces(data.data);

          // Set first workspace as active if none is selected
          if (!activeWorkspace && data.data.length > 0) {
            console.log(
              '[WorkspaceProvider] Setting active workspace:',
              data.data[0]
            );
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

    // Add a small delay to ensure auth is fully initialized
    const timeoutId = setTimeout(() => {
      fetchWorkspaces();
    }, 100);

    // Cleanup function to clear any pending timeouts
    return () => {
      clearTimeout(timeoutId);
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
        setWorkspaceTree: patchWorkspaceTree, // structural-sharing setter
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
