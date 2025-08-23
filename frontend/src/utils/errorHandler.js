/**
 * Global error handler utility for API errors
 * Provides consistent error handling across the application
 */

/**
 * Handles API errors in a consistent way
 * @param {Error} error - The error object from an API call
 * @param {object} options - Additional options
 * @param {Function} options.onUnauthorized - Optional callback for 401 errors
 * @returns {object} Normalized error object with message, code, etc.
 */
export function handleApiError(error, options = {}) {
  console.error('API Error:', error);

  // Default error structure
  const defaultError = {
    message: 'Something went wrong. Please try again.',
    code: 'UNKNOWN_ERROR',
    status: 500,
  };

  // If it's not an Axios error or doesn't have response data
  if (!error.response) {
    return {
      ...defaultError,
      message: 'Network error. Please check your connection and try again.',
      code: 'NETWORK_ERROR',
    };
  }

  // Handle specific HTTP status codes
  const { status, data } = error.response;

  // For 401 Unauthorized, the global interceptor in api.js will handle the logout
  if (status === 401) {
    // If caller provided a custom 401 handler, call it
    if (options.onUnauthorized) {
      options.onUnauthorized();
    }

    return {
      message: 'Your session has expired. Please sign in again.',
      code: 'UNAUTHORIZED',
      status: 401,
    };
  }

  // Handle other common status codes
  switch (status) {
    case 400:
      return {
        message:
          data?.error_message || 'Invalid request. Please check your inputs.',
        code: 'BAD_REQUEST',
        status: 400,
        details: data?.details || {},
      };

    case 403:
      return {
        message: 'You do not have permission to perform this action.',
        code: 'FORBIDDEN',
        status: 403,
      };

    case 404:
      return {
        message: 'The requested resource was not found.',
        code: 'NOT_FOUND',
        status: 404,
      };

    case 422:
      return {
        message:
          data?.error_message || 'Validation error. Please check your inputs.',
        code: 'VALIDATION_ERROR',
        status: 422,
        details: data?.details || {},
      };

    case 429:
      return {
        message: 'Too many requests. Please try again later.',
        code: 'RATE_LIMIT',
        status: 429,
      };

    case 500:
    case 502:
    case 503:
    case 504:
      return {
        message: 'Server error. Please try again later.',
        code: 'SERVER_ERROR',
        status: status,
      };

    default:
      return {
        ...defaultError,
        message: data?.error_message || defaultError.message,
        status: status,
      };
  }
}

/**
 * Display a user-friendly error message
 * @param {Error|object} error - Error object to format
 * @returns {string} User-friendly error message
 */
export function formatErrorMessage(error) {
  if (!error) return 'An unknown error occurred';

  // If it's already a string, return it
  if (typeof error === 'string') return error;

  // If it's a processed error from handleApiError
  if (error.message) return error.message;

  // If it's an axios error object
  if (error.response?.data?.error_message) {
    return error.response.data.error_message;
  }

  // If it's a standard Error object
  if (error instanceof Error) return error.message;

  // Fallback
  return 'Something went wrong. Please try again.';
}
