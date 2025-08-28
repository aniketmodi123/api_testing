import { createContext, useContext, useEffect, useState } from 'react';
import { nodeService } from '../services/nodeService';
import { useWorkspace } from './workspace';

// Create context
const NodeContext = createContext();

export function NodeProvider({ children }) {
  const { activeWorkspace, shouldLoadWorkspaces } = useWorkspace();
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Debounce mechanism to prevent rapid API calls
  const [debouncedRefresh, setDebouncedRefresh] = useState(0);

  // Convert refreshTrigger to debounced version
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedRefresh(refreshTrigger);
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [refreshTrigger]);

  // Fetch nodes for the current workspace
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 3;
    let retryTimeout;

    // Implement retry with exponential backoff
    const retryWithBackoff = () => {
      if (retryCount < maxRetries) {
        // Exponential backoff - wait longer between each retry
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(
          `Retrying node loading in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`
        );

        clearTimeout(retryTimeout);
        retryTimeout = setTimeout(() => {
          retryCount++;
          fetchWorkspaceNodes();
        }, delay);
      } else {
        console.error('Max retries reached. Could not load nodes.');
        setLoading(false);
        setError('Failed to load folders and files after multiple attempts.');
        setNodes([]);
      }
    };

    const fetchWorkspaceNodes = async () => {
      if (!activeWorkspace || !shouldLoadWorkspaces) {
        setNodes([]);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        console.log(`Fetching nodes for workspace: ${activeWorkspace.id}`);
        const result = await fetchNodesByWorkspaceId(activeWorkspace.id);
        if (result && result.data && result.data.file_tree) {
          console.log(
            `Successfully loaded ${result.data.file_tree.length} nodes for workspace`
          );
          setNodes(result.data.file_tree);
          // Reset retry count on success
          retryCount = 0;
        } else {
          console.error('Invalid node data format:', result);
          setNodes([]);
          retryWithBackoff();
        }
      } catch (err) {
        console.error('Error fetching workspace nodes:', err);
        setError('Failed to load folders and files. Retrying...');
        retryWithBackoff();
      } finally {
        // Only set loading to false if we're not in a retry cycle
        if (retryCount === 0) {
          setLoading(false);
        }
      }
    };

    fetchWorkspaceNodes();

    // Cleanup function to clear any pending timeouts
    return () => {
      clearTimeout(retryTimeout);
    };
  }, [activeWorkspace, debouncedRefresh, shouldLoadWorkspaces]);

  // Function to fetch nodes by workspace ID
  const fetchNodesByWorkspaceId = async workspaceId => {
    if (!workspaceId) return null;

    try {
      // Get from cache if available and not a forced refresh
      const cacheKey = `workspace_nodes_${workspaceId}`;
      const cachedData = sessionStorage.getItem(cacheKey);

      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        const cacheTime = parsed.timestamp;
        // Use cache if it's less than 5 seconds old (reduced from 30s to help with startup)
        if (Date.now() - cacheTime < 5000) {
          console.log('Using cached workspace data for:', workspaceId);
          return parsed.data;
        }
      }

      // Fetch fresh data
      console.log(
        'Fetching fresh workspace data for workspace ID:',
        workspaceId
      );
      const result = await nodeService.getNodesByWorkspaceId(workspaceId);

      if (!result || !result.data) {
        console.error('Invalid node data format received:', result);
        throw new Error('Failed to load node data: Invalid format');
      }

      // Cache the result
      sessionStorage.setItem(
        cacheKey,
        JSON.stringify({
          data: result,
          timestamp: Date.now(),
        })
      );

      return result;
    } catch (err) {
      console.error('Error fetching nodes by workspace ID:', err);
      setError(
        `Failed to load folders and files: ${err.message || 'Unknown error'}`
      );
      return null;
    }
  };

  // Create a new node
  const createNode = async nodeData => {
    if (!activeWorkspace) {
      throw new Error('No active workspace selected');
    }

    try {
      setLoading(true);
      // Use proper naming convention for API
      const apiData = {
        workspace_id: nodeData.workspaceId || activeWorkspace.id,
        name: nodeData.name,
        type: nodeData.type || 'folder',
        parent_id: nodeData.parent_id || null,
      };

      const result = await nodeService.createNode(apiData);
      setRefreshTrigger(prev => prev + 1); // Trigger refresh
      return result;
    } catch (err) {
      console.error('Error creating node:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Update a node
  const updateNode = async (nodeId, nodeData) => {
    try {
      setLoading(true);

      // Make sure nodeId is a number
      const numericNodeId = Number(nodeId);
      if (isNaN(numericNodeId)) {
        throw new Error(`Invalid node ID: ${nodeId}`);
      }

      const result = await nodeService.updateNode(numericNodeId, nodeData);

      // Clear cache for the workspace
      if (activeWorkspace?.id) {
        const cacheKey = `workspace_nodes_${activeWorkspace.id}`;
        sessionStorage.removeItem(cacheKey);
      }

      setRefreshTrigger(prev => prev + 1); // Trigger refresh

      // If we updated the selected node, update its data
      if (selectedNode && selectedNode.id === numericNodeId) {
        setSelectedNode(prevNode => ({
          ...prevNode,
          ...nodeData,
        }));
      }

      return result;
    } catch (err) {
      console.error('Error updating node:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Delete a node
  const deleteNode = async nodeId => {
    try {
      setLoading(true);
      await nodeService.deleteNode(nodeId);

      // If deleted node was selected, clear it
      if (selectedNode && selectedNode.id === nodeId) {
        setSelectedNode(null);
      }

      // Clear cache for the workspace
      if (activeWorkspace?.id) {
        const cacheKey = `workspace_nodes_${activeWorkspace.id}`;
        sessionStorage.removeItem(cacheKey);
      }

      setRefreshTrigger(prev => prev + 1); // Trigger refresh
      return true;
    } catch (err) {
      console.error('Error deleting node:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Create a folder
  const createFolder = async folderData => {
    try {
      setLoading(true);
      // Convert to snake_case if needed
      const snakeCaseData = {
        ...folderData,
        workspace_id:
          folderData.workspaceId ||
          folderData.workspace_id ||
          activeWorkspace.id,
        parent_id: folderData.parentId || folderData.parent_id || null,
      };

      // Remove camelCase keys to avoid duplicates
      if (snakeCaseData.workspaceId) delete snakeCaseData.workspaceId;
      if (snakeCaseData.parentId) delete snakeCaseData.parentId;

      const result = await nodeService.createFolder(snakeCaseData);

      // Clear the workspace cache to force a refresh on next load
      const workspaceId = snakeCaseData.workspace_id;
      if (workspaceId) {
        const cacheKey = `workspace_nodes_${workspaceId}`;
        sessionStorage.removeItem(cacheKey);
      }

      setRefreshTrigger(prev => prev + 1); // Trigger refresh
      return result;
    } catch (err) {
      console.error('Error creating folder:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Create a file
  const createFile = async fileData => {
    try {
      setLoading(true);
      // Convert to snake_case if needed
      const snakeCaseData = {
        ...fileData,
        workspace_id:
          fileData.workspaceId || fileData.workspace_id || activeWorkspace.id,
        parent_id: fileData.parentId || fileData.parent_id || null,
        method: fileData.method || 'GET',
        url: fileData.url || '',
      };

      // Remove camelCase keys to avoid duplicates
      if (snakeCaseData.workspaceId) delete snakeCaseData.workspaceId;
      if (snakeCaseData.parentId) delete snakeCaseData.parentId;

      const result = await nodeService.createFile(snakeCaseData);

      // Clear the workspace cache to force a refresh on next load
      const workspaceId = snakeCaseData.workspace_id;
      if (workspaceId) {
        const cacheKey = `workspace_nodes_${workspaceId}`;
        sessionStorage.removeItem(cacheKey);
      }

      setRefreshTrigger(prev => prev + 1); // Trigger refresh
      return result;
    } catch (err) {
      console.error('Error creating file:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Get node by ID
  const getNodeById = nodeId => {
    if (!nodes || !nodeId) return null;
    return nodes.find(node => node.id === nodeId);
  };

  return (
    <NodeContext.Provider
      value={{
        selectedNode,
        setSelectedNode,
        nodes,
        loading,
        error,
        createNode,
        updateNode,
        deleteNode,
        createFolder,
        createFile,
        fetchNodesByWorkspaceId,
        getNodeById,
        refreshNodes: () => setRefreshTrigger(prev => prev + 1),
      }}
    >
      {children}
    </NodeContext.Provider>
  );
}

export function useNode() {
  return useContext(NodeContext);
}
