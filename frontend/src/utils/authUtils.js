/**
 * Authentication utilities for handling common auth-related tasks
 */

// Use a flag to prevent multiple redirects
let isLogoutInProgress = false;

/**
 * Backwards compatibility function for components still using this
 */
export const setLogoutFunction = () => {};

/**
 * Force logout and redirect - the most direct approach
 * This function can be called from anywhere to immediately logout the user
 */
export const forceLogout = () => {
  // Prevent multiple simultaneous logouts
  if (isLogoutInProgress) return;

  isLogoutInProgress = true;

  try {
    // Clear all storage
    localStorage.clear();
    sessionStorage.clear();

    // DEBUG: Log the current path

    // Clear any auth tokens from storage to ensure clean slate
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    // EVEN MORE AGGRESSIVE APPROACH: Force reload to sign-in page

    // Try multiple approaches to increase chances of success
    try {
      window.location.replace('/sign-in'); // Try replace first
    } catch (e) {
      console.error('Replace navigation failed:', e);
      window.location.href = '/sign-in'; // Fallback to href
    }

    // Reset flag after a timeout to allow future logout attempts if needed
    setTimeout(() => {
      isLogoutInProgress = false;
    }, 3000);
  } catch (error) {
    console.error('Error during force logout:', error);
    // Reset flag so we can try again
    isLogoutInProgress = false;

    // Last resort - try a simple redirect
    window.location.href = '/sign-in';
  }
};

/**
 * Force logout and redirect - can be used anywhere in the app
 * This is a simplified version that doesn't depend on auth context
 */
export const forceLogoutIfUnauthorized = error => {
  // Check if this is a 401 Unauthorized error
  if (error?.response?.status === 401) {
    forceLogout();
  }
};

/**
 * Check if a token is expired
 * @param {string} token - JWT token to check
 * @returns {boolean} - True if expired or invalid, false otherwise
 */
export const isTokenExpired = token => {
  if (!token) return true;

  try {
    // Split the token and get the payload
    const payload = JSON.parse(atob(token.split('.')[1]));

    // Check if token is expired
    return Date.now() >= payload.exp * 1000;
  } catch (error) {
    console.error('Error checking token expiration:', error);
    return true;
  }
};
