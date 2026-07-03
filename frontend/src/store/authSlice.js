import { createSlice } from '@reduxjs/toolkit';
import { apiSlice } from './apiSlice';

// Initial state
const initialState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isInitialized: false,
};

// Auth slice
const authSlice = createSlice({
  name: 'auth',
  initialState: (() => {
    // Try to load from localStorage on initialization
    try {
      const token = localStorage.getItem('token');
      const user = localStorage.getItem('user');

      if (token && user) {
        const parsedUser = JSON.parse(user);
        return {
          ...initialState,
          token,
          user: parsedUser,
          isAuthenticated: true,
          isInitialized: true,
        };
      }
    } catch (error) {
      console.error('Error loading auth state from localStorage:', error);
      // Clear corrupted data
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }

    return { ...initialState, isInitialized: true };
  })(),
  reducers: {
    initializeAuth: state => {
      state.isInitialized = true;
    },
    clearAuth: state => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;

      // Clear localStorage
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.clear();
      sessionStorage.clear();
    },
    setUser: (state, action) => {
      state.user = { ...state.user, ...action.payload };

      // Update localStorage
      if (state.user) {
        localStorage.setItem('user', JSON.stringify(state.user));
      }
    },
  },
  extraReducers: builder => {
    builder
      // Handle sign in success
      .addMatcher(
        apiSlice.endpoints.signIn.matchFulfilled,
        (state, { payload }) => {
          // payload may be either the API wrapper { data: {...} } or the unwrapped data
          const data = payload && payload.data ? payload.data : payload || {};
          const { username, access_token } = data;

          // If the backend didn't return a username in the sign-in response,
          // try extracting it from the JWT payload so we can set the username
          // header which the backend expects on subsequent requests.
          let resolvedUsername = username;
          if (!resolvedUsername && access_token) {
            try {
              // Decode JWT payload (safe client-side parse, do not verify)
              const parts = access_token.split('.');
              if (parts.length === 3) {
                const payloadStr = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
                const parsed = JSON.parse(decodeURIComponent(escape(payloadStr)));
                resolvedUsername = parsed.username || parsed.sub || parsed.email || null;
              }
            } catch (e) {
              // ignore decode errors, username will remain undefined
              console.debug('authSlice: failed to decode token for username', e);
            }
          }

          state.user = { email: resolvedUsername };
          state.token = access_token;
          state.isAuthenticated = true;

          // Persist to localStorage
          if (access_token) {
            localStorage.setItem('token', access_token);
          }
          const persistedUsername = username || resolvedUsername;
          if (persistedUsername) {
            localStorage.setItem('user', JSON.stringify({ email: persistedUsername }));
          }
        }
      )
      // Handle logout success
      .addMatcher(apiSlice.endpoints.logout.matchFulfilled, state => {
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;

        // Clear localStorage
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.clear();
        sessionStorage.clear();
      })
      // Handle get user profile success
      .addMatcher(
        apiSlice.endpoints.getUserProfile.matchFulfilled,
        (state, { payload }) => {
          const data = payload && payload.data ? payload.data : payload || {};
          state.user = { ...state.user, ...data };

          // Update localStorage
          if (state.user) {
            localStorage.setItem('user', JSON.stringify(state.user));
          }
        }
      )
      // Handle update user profile success
      .addMatcher(
        apiSlice.endpoints.updateUserProfile.matchFulfilled,
        (state, { payload }) => {
          state.user = { ...state.user, ...payload };

          // Update localStorage
          if (state.user) {
            localStorage.setItem('user', JSON.stringify(state.user));
          }
        }
      )
      // Handle delete user success
      .addMatcher(apiSlice.endpoints.deleteUser.matchFulfilled, state => {
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;

        // Clear localStorage
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.clear();
        sessionStorage.clear();
      })
      // Handle change password success
      .addMatcher(apiSlice.endpoints.changePassword.matchFulfilled, state => {
        // Logout user after successful password change
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;

        // Clear localStorage
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.clear();
        sessionStorage.clear();
      });
  },
});

// Actions
export const { initializeAuth, clearAuth, setUser } = authSlice.actions;

// Selectors
export const selectCurrentUser = state => state.auth.user;
export const selectToken = state => state.auth.token;
export const selectIsAuthenticated = state => state.auth.isAuthenticated;
export const selectIsInitialized = state => state.auth.isInitialized;
export const selectUsername = state => state.auth.user?.email || null;

// Thunk actions for compatibility with existing code
export const loginThunk = (email, password) => async (dispatch, getState) => {
  try {
    const result = await dispatch(
      apiSlice.endpoints.signIn.initiate({ email, password })
    ).unwrap();

    // Fetch user profile after successful login
    dispatch(apiSlice.endpoints.getUserProfile.initiate());

    return true;
  } catch (error) {
    throw error;
  }
};

export const signupThunk = (email, password) => async dispatch => {
  try {
    await dispatch(
      apiSlice.endpoints.signUp.initiate({ email, password })
    ).unwrap();

    return true;
  } catch (error) {
    throw error;
  }
};

export const logoutThunk = () => async (dispatch, getState) => {
  const state = getState();
  const token = selectToken(state);

  try {
    // Only try to call logout API if we have a token
    if (token) {
      await dispatch(apiSlice.endpoints.logout.initiate()).unwrap();
    }
  } catch (error) {
    // Just log the error, but continue with local logout
    console.error('Logout API error:', error);
  } finally {
    // Always clear state, even if API call fails
    dispatch(clearAuth());
  }
};

// Export reducer
export default authSlice.reducer;
