import { api } from '../api.js';

/**
 * Service for managing folder-level headers
 * These headers work like Postman's pre-request scripts to set default headers for all requests in a folder
 */
export const headerService = {
  /**
   * Set headers for a folder
   * @param {number} folderId - ID of the folder
   * @param {Object} headers - Header data as key-value pairs
   * @returns {Promise} Promise with created header data
   */
  async setHeaders(folderId, headers) {
    try {
      const response = await api.post(`/${folderId}/headers`, {
        content: headers,
      });
      return response.data;
    } catch (error) {
      console.error('Error setting folder headers:', error);
      throw error;
    }
  },

  /**
   * Update headers for a folder
   * @param {number} folderId - ID of the folder
   * @param {Object} headers - Updated header data as key-value pairs
   * @returns {Promise} Promise with updated header data
   */
  async updateHeaders(folderId, headers) {
    try {
      const response = await api.put(`/${folderId}/headers`, {
        content: headers,
      });
      return response.data;
    } catch (error) {
      console.error('Error updating folder headers:', error);
      throw error;
    }
  },

  /**
   * Get headers for a folder
   * @param {number} folderId - ID of the folder
   * @returns {Promise} Promise with folder header data
   */
  async getHeaders(folderId) {
    try {
      const response = await api.get(`/${folderId}/headers`);
      return response.data;
    } catch (error) {
      if (error.response?.status === 404 || error.response?.status === 206) {
        // No headers found for this folder - not an error
        return { data: { content: {} } };
      }
      console.error('Error fetching folder headers:', error);
      throw error;
    }
  },

  /**
   * Delete headers for a folder
   * @param {number} folderId - ID of the folder
   * @returns {Promise} Promise with deletion result
   */
  async deleteHeaders(folderId) {
    try {
      const response = await api.delete(`/${folderId}/headers`);
      return response.data;
    } catch (error) {
      console.error('Error deleting folder headers:', error);
      throw error;
    }
  },

  /**
   * Get complete headers for a folder (including inherited headers from parent folders)
   * @param {number} folderId - ID of the folder
   * @param {boolean} includeDetails - Whether to include inheritance details
   * @returns {Promise} Promise with complete headers data
   */
  async getCompleteHeaders(folderId, includeDetails = false) {
    try {
      const headers = includeDetails ? { 'include-details': 'true' } : {};
      const response = await api.get(`/${folderId}/headers/complete`, {
        headers,
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching complete headers:', error);
      throw error;
    }
  },
};
