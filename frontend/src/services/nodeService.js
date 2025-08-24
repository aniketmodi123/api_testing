import { api } from '../api.js';

/**
 * Service for managing nodes (folders/files)
 */
export const nodeService = {
  /**
   * Create a new folder
   * @param {Object} folderData - Folder data (workspace_id, name, parent_id)
   * @returns {Promise} Promise with created folder node
   */
  async createFolder(folderData) {
    try {
      const nodeData = {
        ...folderData,
        type: 'folder',
      };
      console.log('Creating folder with data:', nodeData);
      const response = await api.post('/node/create', nodeData);
      console.log('Folder created successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error creating folder:', error, error.response?.data);
      throw error;
    }
  },

  /**
   * Create a new file
   * @param {Object} fileData - File data (workspace_id, name, parent_id, method, url)
   * @returns {Promise} Promise with created file node
   */
  async createFile(fileData) {
    try {
      const { method, url, ...nodeData } = fileData;
      const response = await api.post('/node/create', {
        ...nodeData,
        type: 'file',
        metadata: { method, url },
      });
      return response.data;
    } catch (error) {
      console.error('Error creating file:', error);
      throw error;
    }
  },

  /**
   * Create a new node (folder or file)
   * @param {Object} nodeData - Node data using snake_case (workspace_id, name, type, parent_id)
   * @returns {Promise} Promise with created node
   */
  async createNode(nodeData) {
    try {
      const response = await api.post('/node/create', nodeData);
      return response.data;
    } catch (error) {
      console.error('Error creating node:', error);
      throw error;
    }
  },

  /**
   * Get all nodes for a workspace
   * @param {number} workspaceId - Workspace ID
   * @returns {Promise} Promise with workspace nodes
   */
  async getNodesByWorkspaceId(workspaceId) {
    try {
      // Add a timestamp parameter to prevent browser caching
      const response = await api.get(`/workspace/${workspaceId}`, {
        params: { _t: Date.now() },
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });
      console.log(
        'Workspace data fetched at:',
        new Date().toLocaleTimeString()
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching workspace nodes:', error);
      throw error;
    }
  },

  /**
   * Get node details with its children
   * @param {number} nodeId - Node ID
   * @returns {Promise} Promise with node details and children
   */
  async getNodeWithChildren(nodeId) {
    try {
      const response = await api.get(`/node/${nodeId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching node with children:', error);
      throw error;
    }
  },

  /**
   * Update a node (rename/move)
   * @param {number} nodeId - Node ID
   * @param {Object} nodeData - Updated node data (name and/or parent_id)
   * @returns {Promise} Promise with updated node
   */
  async updateNode(nodeId, nodeData) {
    try {
      if (!nodeId || typeof nodeId !== 'number') {
        throw new Error(`Invalid node ID: ${nodeId}`);
      }
      console.log(`Updating node ${nodeId} with data:`, nodeData);
      const response = await api.put(`/node/${nodeId}`, nodeData);
      return response.data;
    } catch (error) {
      console.error(`Error updating node ${nodeId}:`, error);
      throw error;
    }
  },

  /**
   * Delete a node and its children
   * @param {number} nodeId - Node ID
   * @returns {Promise} Promise with deletion result
   */
  async deleteNode(nodeId) {
    const response = await api.delete(`/node/${nodeId}`);
    return response.data;
  },
};
