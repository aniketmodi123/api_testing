import { createContext, useContext, useEffect, useReducer } from 'react';
import { api } from '../api.js';

// Action types
const LOGIN_START = 'LOGIN_START';
const LOGIN_SUCCESS = 'LOGIN_SUCCESS';
const LOGIN_ERROR = 'LOGIN_ERROR';
const LOGOUT = 'LOGOUT';
const SIGNUP_START = 'SIGNUP_START';
const SIGNUP_SUCCESS = 'SIGNUP_SUCCESS';
const SIGNUP_ERROR = 'SIGNUP_ERROR';
const PROFILE_START = 'PROFILE_START';
const PROFILE_SUCCESS = 'PROFILE_SUCCESS';
const PROFILE_ERROR = 'PROFILE_ERROR';
const UPDATE_USER_START = 'UPDATE_USER_START';
const UPDATE_USER_SUCCESS = 'UPDATE_USER_SUCCESS';
const UPDATE_USER_ERROR = 'UPDATE_USER_ERROR';
const PASSWORD_RESET_START = 'PASSWORD_RESET_START';
const PASSWORD_RESET_SUCCESS = 'PASSWORD_RESET_SUCCESS';
const PASSWORD_RESET_ERROR = 'PASSWORD_RESET_ERROR';
const OTP_START = 'OTP_START';
const OTP_SUCCESS = 'OTP_SUCCESS';
const OTP_ERROR = 'OTP_ERROR';

// Initial state
const initialState = {
  user: null,
  token: null,
  loading: false,
  error: null,
  profileLoading: false,
  profileError: null,
  updateUserLoading: false,
  updateUserError: null,
  resetPasswordLoading: false,
  resetPasswordError: null,
  otpLoading: false,
  otpError: null,
  otpSent: false,
};

// Reducer
function authReducer(state, action) {
  switch (action.type) {
    case LOGIN_START:
    case SIGNUP_START:
      return { ...state, loading: true, error: null };
    case LOGIN_SUCCESS:
      return {
        ...state,
        loading: false,
        user: { email: action.payload.username },
        token: action.payload.token,
        error: null,
      };
    case SIGNUP_SUCCESS:
      return {
        ...state,
        loading: false,
        error: null,
        // No token or user for signup success - user will need to sign in
      };
    case LOGIN_ERROR:
    case SIGNUP_ERROR:
      return { ...state, loading: false, error: action.payload };
    case PROFILE_START:
      return { ...state, profileLoading: true, profileError: null };
    case PROFILE_SUCCESS:
      return {
        ...state,
        profileLoading: false,
        user: { ...state.user, ...action.payload },
        profileError: null,
      };
    case PROFILE_ERROR:
      return { ...state, profileLoading: false, profileError: action.payload };
    case UPDATE_USER_START:
      return { ...state, updateUserLoading: true, updateUserError: null };
    case UPDATE_USER_SUCCESS:
      return {
        ...state,
        updateUserLoading: false,
        user: { ...state.user, ...action.payload },
        updateUserError: null,
      };
    case UPDATE_USER_ERROR:
      return {
        ...state,
        updateUserLoading: false,
        updateUserError: action.payload,
      };
    case PASSWORD_RESET_START:
      return { ...state, resetPasswordLoading: true, resetPasswordError: null };
    case PASSWORD_RESET_SUCCESS:
      return {
        ...state,
        resetPasswordLoading: false,
        resetPasswordError: null,
      };
    case PASSWORD_RESET_ERROR:
      return {
        ...state,
        resetPasswordLoading: false,
        resetPasswordError: action.payload,
      };
    case OTP_START:
      return { ...state, otpLoading: true, otpError: null, otpSent: false };
    case OTP_SUCCESS:
      return { ...state, otpLoading: false, otpError: null, otpSent: true };
    case OTP_ERROR:
      return {
        ...state,
        otpLoading: false,
        otpError: action.payload,
        otpSent: false,
      };
    case LOGOUT:
      return { ...initialState };
    default:
      return state;
  }
}

// Context
const AuthContext = createContext();

// Provider
export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState, init => {
    // Try to load from localStorage
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    return token && user ? { ...init, token, user: JSON.parse(user) } : init;
  });

  // Persist to localStorage
  useEffect(() => {
    if (state.token && state.user) {
      localStorage.setItem('token', state.token);
      localStorage.setItem('user', JSON.stringify(state.user));
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  }, [state.token, state.user]);

  // Setup axios interceptor for auth headers
  useEffect(() => {
    const requestInterceptor = api.interceptors.request.use(
      config => {
        if (state.token) {
          config.headers['Authorization'] = state.token;
        }
        if (state.user?.email) {
          config.headers['username'] = state.user.email;
        }
        return config;
      },
      error => Promise.reject(error)
    );

    return () => {
      api.interceptors.request.eject(requestInterceptor);
    };
  }, [state.token, state.user]);

  // Auth actions
  const login = async (email, password) => {
    dispatch({ type: LOGIN_START });
    try {
      const res = await api.post('/sign_in', { email, password });
      dispatch({
        type: LOGIN_SUCCESS,
        payload: { username: email, token: res.data.data.access_token },
      });
      // Fetch user profile after successful login
      getUserProfile();
      return true;
    } catch (err) {
      dispatch({
        type: LOGIN_ERROR,
        payload: err.response?.data?.error_message || err.message,
      });
      throw err;
    }
  };

  const signup = async (email, password) => {
    dispatch({ type: SIGNUP_START });
    try {
      await api.post('/sign_up', { email, password });
      dispatch({ type: SIGNUP_SUCCESS });
      return true;
    } catch (err) {
      dispatch({
        type: SIGNUP_ERROR,
        payload: err.response?.data?.error_message || err.message,
      });
      throw err;
    }
  };

  const logout = async () => {
    try {
      if (state.token) {
        await api.delete('/logout', {
          headers: {
            Authorization: state.token,
            username: state.user?.email,
          },
        });
      }
    } catch (err) {
      console.error('Error during logout:', err);
    } finally {
      dispatch({ type: LOGOUT });
    }
  };

  const getUserProfile = async () => {
    // Prevent /me call if not authenticated
    if (!state.token) return;

    // Prevent duplicate calls if already loading profile
    if (state.profileLoading) return;

    dispatch({ type: PROFILE_START });
    try {
      const res = await api.get('/me');
      dispatch({
        type: PROFILE_SUCCESS,
        payload: res.data.data,
      });
      return res.data.data;
    } catch (err) {
      dispatch({
        type: PROFILE_ERROR,
        payload: err.response?.data?.error_message || err.message,
      });
      throw err;
    }
  };

  const updateUserProfile = async userData => {
    dispatch({ type: UPDATE_USER_START });
    try {
      await api.put('/update_user', userData);
      dispatch({
        type: UPDATE_USER_SUCCESS,
        payload: userData,
      });
      // Refresh the full profile
      await getUserProfile();
      return true;
    } catch (err) {
      dispatch({
        type: UPDATE_USER_ERROR,
        payload: err.response?.data?.error_message || err.message,
      });
      throw err;
    }
  };

  // Step 1: Send OTP to email
  const requestPasswordReset = async email => {
    dispatch({ type: PASSWORD_RESET_START });
    try {
      await api.post('/send-otp', { email });
      dispatch({ type: PASSWORD_RESET_SUCCESS });
      return true;
    } catch (err) {
      dispatch({
        type: PASSWORD_RESET_ERROR,
        payload: err.response?.data?.error_message || err.message,
      });
      throw err;
    }
  };

  // Step 2: Reset password with OTP
  const resetPassword = async (email, otp, newPassword, confirmPassword) => {
    dispatch({ type: PASSWORD_RESET_START });
    try {
      const res = await api.post('/forgot-password', {
        email,
        otp: Number(otp),
        new_password: newPassword,
        new_password_again: confirmPassword,
      });
      dispatch({ type: PASSWORD_RESET_SUCCESS });
      return {
        success: true,
        message: res.data?.message || 'Password reset successful',
      };
    } catch (err) {
      dispatch({
        type: PASSWORD_RESET_ERROR,
        payload: err.response?.data?.error_message || err.message,
      });
      return {
        success: false,
        message: err.response?.data?.error_message || err.message,
      };
    }
  };

  const deleteAccount = async () => {
    try {
      await api.delete('/delete_user');
      dispatch({ type: LOGOUT });
      return true;
    } catch (err) {
      console.error('Error deleting account:', err);
      throw err;
    }
  };

  // Create auth context value
  const contextValue = {
    ...state,
    login,
    signup,
    logout,
    getUserProfile,
    updateUserProfile,
    requestPasswordReset,
    resetPassword,
    deleteAccount,
    // Change password for logged-in user
    async changePassword(oldPassword, newPassword, confirmPassword) {
      try {
        const res = await api.post(
          '/change-password',
          {
            old_password: oldPassword,
            new_password: newPassword,
            new_password_again: confirmPassword,
          },
          {
            headers: {
              username: state.user?.email || '',
            },
          }
        );
        // Logout user after successful password change
        dispatch({ type: LOGOUT });
        return {
          success: true,
          message: res.data?.message || 'Password changed successfully',
        };
      } catch (err) {
        return {
          success: false,
          message: err.response?.data?.error_message || err.message,
        };
      }
    },
    // Helper getter for username (backwards compatibility)
    get username() {
      return state.user?.email || null;
    },
  };

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

// Hook
export function useAuth() {
  return useContext(AuthContext);
}
