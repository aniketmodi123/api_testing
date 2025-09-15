// Delete a node and return the updated workspace tree
// (Assumes backend returns the new workspace tree in response.data)
import { api } from '../api.js';

export async function deleteNodeAndGetTree(nodeId) {
  const response = await api.delete(`/node/${nodeId}`);
  return response.data;
}
