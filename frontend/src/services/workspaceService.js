import { api } from '../api.js';

/**
 * Service for managing workspaces
 */
export const workspaceService = {
  /**
   * Get all workspaces
   * @returns {Promise} Promise with workspace data
   */
  async getWorkspaces() {
    const response = await api.get('/workspace');
    return response.data;
  },

  /**
   * Get workspace tree (collections, folders, requests)
   * @param {number} workspaceId - Workspace ID
   * @returns {Promise} Promise with workspace tree data
   */
  async getWorkspaceTree(workspaceId) {
    const response = await api.get(`/workspace/${workspaceId}/tree`);
    return response.data;
  },

  /**
   * Create a new workspace
   * @param {Object} workspaceData - Workspace data
   * @returns {Promise} Promise with created workspace
   */
  async createWorkspace(workspaceData) {
    const response = await api.post('/workspace', workspaceData);
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
   * Delete a workspace
   * @param {number} workspaceId - Workspace ID
   * @returns {Promise} Promise with deletion result
   */
  async deleteWorkspace(workspaceId) {
    const response = await api.delete(`/workspace/${workspaceId}`);
    return response.data;
  },
};
