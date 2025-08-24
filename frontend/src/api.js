import axios from 'axios';
import { handleApiError } from './utils/errorHandler';

export const API_BASE = 'http://localhost:8000';
export const api = axios.create({ baseURL: API_BASE });

// Add request interceptor to automatically add auth headers
api.interceptors.request.use(config => {
  // Always add these headers
  config.headers['accept'] = 'application/json';

  // Log request details
  console.log(`API Request: ${config.method.toUpperCase()} ${config.url}`, {
    data: config.data,
    params: config.params,
  });

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
  if (token) {
    config.headers['Authorization'] = token;
  }

  if (userObj?.email) {
    config.headers['username'] = userObj.email;
  }

  return config;
});

// Import forceLogout from authUtils
import { forceLogout } from './utils/authUtils';

// Handle 401 Unauthorized globally - clear localStorage and redirect to sign-in
api.interceptors.response.use(
  response => response,
  error => {
    // More detailed logging for debugging
    console.log('API error intercepted:', {
      status: error.response?.status,
      url: error.config?.url,
      method: error.config?.method,
      pathname: window.location.pathname,
    });

    // Handle 401 errors - more aggressively check for 401
    if (error.response && error.response.status === 401) {
      console.log('401 Unauthorized detected in API interceptor', {
        url: error.config?.url,
        skipAuth: error.config?._skipAuthRefresh,
        enforceAuth: error.config?._enforceAuthCheck,
      });

      // Special debugging for /me endpoint
      if (error.config?.url === '/me') {
        console.log(
          '401 on /me endpoint detected - this should trigger logout!'
        );
      }

      // Only avoid redirect if we're already on sign-in page
      if (window.location.pathname === '/sign-in') {
        console.log('Already on sign-in page, not redirecting');
      } else {
        console.log('Calling forceLogout due to 401');
        // Use the direct forceLogout approach
        forceLogout();
      }

      return Promise.reject(error);
    }

    // Process the error with our error handler utility
    const processedError = handleApiError(error);

    // Log it for debugging
    console.log('API Error:', processedError);

    // Always reject the promise with the original error
    // so components can handle specific error cases if needed
    return Promise.reject(error);
  }
);
