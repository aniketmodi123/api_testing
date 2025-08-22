import { createContext, useContext, useEffect, useReducer } from 'react';
import { api } from '../api.js';

// Initial state
const initialState = {
  username: null,
  token: null,
  loading: false,
  error: null,
};

// Actions
const LOGIN_START = 'LOGIN_START';
const LOGIN_SUCCESS = 'LOGIN_SUCCESS';
const LOGIN_ERROR = 'LOGIN_ERROR';
const LOGOUT = 'LOGOUT';
const SIGNUP_START = 'SIGNUP_START';
const SIGNUP_SUCCESS = 'SIGNUP_SUCCESS';
const SIGNUP_ERROR = 'SIGNUP_ERROR';

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
        username: action.payload.username,
        token: action.payload.token,
        error: null,
      };
    case SIGNUP_SUCCESS:
      return {
        ...state,
        loading: false,
        error: null,
        // No token or username for signup success - user will need to login
      };
    case LOGIN_ERROR:
    case SIGNUP_ERROR:
      return { ...state, loading: false, error: action.payload };
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
    const username = localStorage.getItem('username');
    return token && username
      ? { ...init, token, username: JSON.parse(username) }
      : init;
  });

  // Persist to localStorage
  useEffect(() => {
    if (state.token && state.username) {
      localStorage.setItem('token', state.token);
      localStorage.setItem('username', JSON.stringify(state.username));
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
    }
  }, [state.token, state.username]);

  // Auth actions
  const login = async (email, password) => {
    dispatch({ type: LOGIN_START });
    try {
      const res = await api.post('/sign_in', { email, password });
      dispatch({
        type: LOGIN_SUCCESS,
        payload: { username: email, token: res.data.data.access_token },
      });
    } catch (err) {
      dispatch({
        type: LOGIN_ERROR,
        payload: err.response?.data?.error_message || err.message,
      });
    }
  };

  const signup = async (email, password) => {
    dispatch({ type: SIGNUP_START });

    try {
      // Backend only expects email and password
      const res = await api.post('/sign_up', { email, password });

      // The signup endpoint doesn't return a token, it just creates the account
      dispatch({
        type: SIGNUP_SUCCESS,
        payload: null, // No token to save, user will need to sign in
      });
      return true; // Return true to indicate success
    } catch (err) {
      dispatch({
        type: SIGNUP_ERROR,
        payload: err.response?.data?.error_message || err.message,
      });
      throw err; // Re-throw the error so it can be caught in the component
    }
  };

  const logout = async () => {
    try {
      // Get the current token from state
      const token = state.token;

      if (token) {
        // Call the logout API with the token in the Authorization header
        await api.delete('/logout', {
          headers: {
            Authorization: token,
            username: state.username,
          },
        });
        console.log('Logout API called successfully');
      }

      // Dispatch logout action regardless of API success
      dispatch({ type: LOGOUT });
    } catch (err) {
      console.error('Error during logout:', err);
      // Still logout the user locally even if API call fails
      dispatch({ type: LOGOUT });
    }
  };

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook
export function useAuth() {
  return useContext(AuthContext);
}
