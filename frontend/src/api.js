import axios from 'axios';
import { handleApiError } from './utils/errorHandler';

export const API_BASE =
  import.meta.env.VITE_API_BASE || 'https://api-testing-2vjt.onrender.com';
export const api = axios.create({ baseURL: API_BASE });

/**
 * What it does: Reads the stored credentials and returns the auth request headers shared
 * by the axios client and the RTK Query base query — the single source for auth headers.
 * Returns:
 *   object: ``{ Authorization, username }`` — each key present only when its source value
 *           exists in localStorage; an empty object when the user is signed out.
 */
export function getAuthHeaders() {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');

  let email = null;
  try {
    if (user) email = JSON.parse(user)?.email ?? null;
  } catch (e) {
    console.error('Error parsing user from localStorage:', e);
  }

  const headers = {};
  if (token) {
    headers.Authorization = token.startsWith('Bearer ')
      ? token
      : `Bearer ${token}`;
  }
  if (email) headers.username = email;
  return headers;
}

// By default we don't send cookies; enable if your backend uses cookie-based sessions
// api.defaults.withCredentials = true;

// Add request interceptor to automatically add auth headers
api.interceptors.request.use(config => {
  // Always add these headers
  config.headers['accept'] = 'application/json';

  // Add ngrok warning bypass header if using ngrok (for any ngrok URL, not just API_BASE)
  const requestUrl = config.baseURL + (config.url || '');
  if (requestUrl.includes('ngrok') || API_BASE.includes('ngrok')) {
    config.headers['ngrok-skip-browser-warning'] = 'true';
    config.headers['User-Agent'] = 'API-Testing-Tool/1.0';
  }

  // Apply the shared auth headers without overriding any explicitly set on the request.
  const authHeaders = getAuthHeaders();
  if (authHeaders.Authorization && !('Authorization' in config.headers)) {
    config.headers['Authorization'] = authHeaders.Authorization;
  }
  if (authHeaders.username && !('username' in config.headers)) {
    config.headers['username'] = authHeaders.username;
  }

  return config;
});

// Import forceLogout from authUtils
import { forceLogout } from './utils/authUtils';

// Handle 401 Unauthorized globally - clear localStorage and redirect to sign-in
// Note: Only redirect on specific backend session expiry message, not all 401s
api.interceptors.response.use(
  response => response,
  error => {
    // Handle 401 errors - check for specific backend session expiry message
    if (error.response && error.response.status === 401) {
      // Log the full response body to help debugging
      try {
        console.debug('[api] 401 response body:', error.response.data);
      } catch {
        /* ignore */
      }

      // If the request explicitly opts out of auth refresh handling, don't redirect
      const requestConfig = error.config || {};
      const skipAuthRefresh = requestConfig._skipAuthRefresh === true;

      // If already on sign-in page, no need to redirect
      const alreadyOnSignIn = window.location.pathname === '/sign-in';

      if (!skipAuthRefresh && !alreadyOnSignIn) {
        console.log('🔒 401 Unauthorized - redirecting to sign-in');
        forceLogout();
      } else if (skipAuthRefresh) {
        console.log(
          '[api] 401 received but _skipAuthRefresh is set; not redirecting'
        );
      }

      return Promise.reject(error);
    }

    // Process the error with our error handler utility (logging/normalization side effect)
    handleApiError(error);

    return Promise.reject(error);
  }
);
