import axios from 'axios';
import { handleApiError } from './utils/errorHandler';

export const API_BASE =
  import.meta.env.VITE_API_BASE || 'https://api-testing-2vjt.onrender.com';
export const api = axios.create({ baseURL: API_BASE });

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
      // Check if this is our backend's session expiry message
      const errorMessage = error.response?.data?.error_message;
      const isBackendSessionExpired =
        errorMessage ===
        'Authentication required again since your session has expired';

      if (isBackendSessionExpired) {
        // Only avoid redirect if we're already on sign-in page
        if (window.location.pathname === '/sign-in') {
          // Already on sign-in page, not redirecting
        } else {
          // This is a backend session expiry, trigger logout and redirect
          console.log('🔒 Backend session expired - redirecting to sign-in');
          forceLogout();
        }
      } else {
        // This is an external API 401 or different 401, just log it
        console.log(
          '🔒 401 Unauthorized (external API or different auth error):',
          errorMessage || 'No error message'
        );
      }

      return Promise.reject(error);
    }

    // Process the error with our error handler utility
    const processedError = handleApiError(error);

    return Promise.reject(error);
  }
);
