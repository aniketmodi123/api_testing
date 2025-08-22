import axios from 'axios';
export const API_BASE = 'http://localhost:8000';
export const api = axios.create({ baseURL: API_BASE });
// Optionally, add static headers or use context-aware logic in components
api.interceptors.request.use(config => {
  config.headers['accept'] = 'application/json';
  return config;
});
