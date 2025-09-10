import { api } from '../api.js';

/**
 * Helper function to transform the tree structure to the format expected by UI components
 * @param {Array} children - Array of tree nodes
 * @returns {Array} Transformed items for UI rendering
 */
function transformTreeToItems(children) {
  if (!children || !Array.isArray(children)) {
    return [];
  }

  return children.map(node => {
    const item = {
      id: node.id,
      name: node.name,
      type: node.type === 'folder' ? 'folder' : 'request',
    };

    // If it's a folder, process its children recursively
    if (node.type === 'folder' && node.children) {
      item.items = transformTreeToItems(node.children);
    }

    // If it's a file (request), add placeholder method and URL properties
    // These would typically be loaded from the actual request data
    if (node.type === 'file') {
      item.method = 'GET'; // Default method, should be replaced with actual data
      item.url = ''; // Default URL, should be replaced with actual data
    }

    return item;
  });
}

/**
 * Service for managing workspaces
 */
export const workspaceService = {
  /**
   * Get all workspaces
   * @returns {Promise} Promise with workspace data
   */
  async getWorkspaces() {
    const response = await api.get('/workspace/list');
    return response.data;
  },

  /**
   * Get workspace tree (collections, folders, requests)
   * @param {number} workspaceId - Workspace ID
   * @returns {Promise} Promise with workspace tree data
   */
  async getWorkspaceTree(workspaceId) {
    const response = await api.get(`/workspace/${workspaceId}`);

    // Transform the response to match the expected format for the UI
    if (response.data && response.data.data) {
      const workspaceData = response.data.data;

      // If there's file_tree data, format it for the UI
      if (workspaceData.file_tree && Array.isArray(workspaceData.file_tree)) {
        return {
          ...response.data,
          data: {
            id: workspaceData.id,
            name: workspaceData.name,
            description: workspaceData.description,
            collections: workspaceData.file_tree.map(folder => ({
              id: folder.id,
              name: folder.name,
              items: transformTreeToItems(folder.children || []),
            })),
          },
        };
      }
    }

    return response.data;
  },

  /**
   * Create a new workspace
   * @param {Object} workspaceData - Workspace data
   * @returns {Promise} Promise with created workspace
   */
  async createWorkspace(workspaceData) {
    const response = await api.post('/workspace/create', workspaceData);
    return response.data;
  },

  /**
   * Update an existing workspace
   * @param {number} workspaceId - Workspace ID
   * @param {Object} workspaceData - Updated workspace data
   * @returns {Promise} Promise with updated workspace
   */
  async updateWorkspace(workspaceId, workspaceData) {
    const response = await api.put(`/workspace/${workspaceId}`, workspaceData);
    return response.data;
  },

  /**
   * Get workspace tree with APIs and test cases for bulk testing
   * @param {number} workspaceId - Workspace ID
   * @returns {Promise} Promise with workspace tree data including APIs and test cases
   */
  async getBulkTestingTree(workspaceId) {
    const response = await api.get(
      `/workspace/${workspaceId}?include_apis=true`
    );

    // Return the response directly without transformation to avoid multiple calls
    // and preserve the exact structure from backend
    return response.data;
  },

  /**
   * Delete a workspace
   * @param {number} workspaceId - Workspace ID
   * @returns {Promise} Promise with deletion result
   */
  async deleteWorkspace(workspaceId) {
    const response = await api.delete(`/workspace/${workspaceId}`);
    return response.data;
  },

  /**
   * Move a file or folder to a different location
   * @param {number} nodeId - ID of the node to move
   * @param {number} targetWorkspaceId - Target workspace ID
   * @param {number|null} targetFolderId - Target folder ID (null for root)
   * @param {string} newName - New name for the moved item
   * @returns {Promise} Promise with move result
   */
  async moveNode(nodeId, targetWorkspaceId, targetFolderId, newName) {
    const response = await api.put(`/node/${nodeId}/move`, {
      target_workspace_id: targetWorkspaceId,
      target_folder_id: targetFolderId,
      new_name: newName,
    });
    return response.data;
  },

  /**
   * Copy a file or folder to a different location
   * @param {number} nodeId - ID of the node to copy
   * @param {number} targetWorkspaceId - Target workspace ID
   * @param {number|null} targetFolderId - Target folder ID (null for root)
   * @param {string} newName - New name for the copied item
   * @returns {Promise} Promise with copy result
   */
  async copyNode(nodeId, targetWorkspaceId, targetFolderId, newName) {
    const response = await api.post(`/node/${nodeId}/copy`, {
      target_workspace_id: targetWorkspaceId,
      target_folder_id: targetFolderId,
      new_name: newName,
    });
    return response.data;
  },
};
