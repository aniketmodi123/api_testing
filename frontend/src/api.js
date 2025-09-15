import axios from 'axios';
import { handleApiError } from './utils/errorHandler';

export const API_BASE =
  import.meta.env.VITE_API_BASE || 'https://api-testing-2vjt.onrender.com';
export const api = axios.create({ baseURL: API_BASE });

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

  // Get token from localStorage - this ensures we always use the latest token
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  let userObj = null;

  try {
    if (user) {
      userObj = JSON.parse(user);
    }
  } catch (e) {
    console.error('Error parsing user from localStorage:', e);
  }

  // Add auth headers if available
  if (token && !('Authorization' in config.headers)) {
    // Ensure backend receives Bearer token format
    config.headers['Authorization'] =
      typeof token === 'string' && token.startsWith('Bearer ')
        ? token
        : `Bearer ${token}`;
  }

  // Debug: log whether we will send auth for this request
  try {
    // Avoid spamming prod logs; keep as debug
    console.debug('[api] Request:', config.method?.toUpperCase(), config.url, {
      hasAuthorization: !!config.headers['Authorization'],
      usernameHeader: !!config.headers['username'],
      baseURL: config.baseURL,
      withCredentials:
        config.withCredentials || api.defaults.withCredentials || false,
    });
  } catch (e) {
    /* ignore */
  }

  if (userObj?.email && !('username' in config.headers)) {
    config.headers['username'] = userObj.email;
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
      } catch (e) {
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

    // Process the error with our error handler utility
    const processedError = handleApiError(error);

    return Promise.reject(error);
  }
);
