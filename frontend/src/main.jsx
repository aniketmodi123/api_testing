import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  Navigate,
  Route,
  HashRouter as Router,
  Routes,
} from 'react-router-dom';
import App from './App.jsx';
import AuthGuard from './components/AuthGuard.jsx';
import { ThemeProvider } from './components/ThemeProvider.jsx';
import ChangePassword from './features/auth/components/ChangePassword.jsx';
import DeleteAccount from './features/auth/components/DeleteAccount.jsx';
import ForgotPassword from './features/auth/components/ForgotPassword.jsx';
import SimpleUserProfile from './features/auth/components/SimpleUserProfile.jsx';
import UpdateProfile from './features/auth/components/UpdateProfile.jsx';
import Home from './pages/Home/Home.jsx';
import SignIn from './pages/SignIn.jsx';
import SignUp from './pages/SignUp.jsx';
import { EnvironmentProvider } from './store/environment.jsx';
import { NodeProvider } from './store/node.jsx';
import { AuthProvider } from './store/session.jsx';
import { WorkspaceProvider } from './store/workspace.jsx';
import './styles/global.css';

import { ApiProvider } from './store/api.jsx';

// Suppress non-error console logs in production unless explicitly enabled
if (import.meta.env.PROD && import.meta.env.VITE_ENABLE_DEBUG_LOGS !== 'true') {
  const noop = () => {};
  // Preserve console.error, mute noisy dev/test logs
  console.log = noop;
  console.debug = noop;
  console.info = noop;
  console.warn = noop;
  console.trace = noop;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <EnvironmentProvider>
            <NodeProvider>
              <ApiProvider>
                <Router
                  future={{
                    v7_startTransition: true,
                    v7_relativeSplatPath: true,
                  }}
                >
                  <Routes>
                    <Route
                      path="/sign-in"
                      element={
                        <App>
                          <SignIn />
                        </App>
                      }
                    />
                    <Route
                      path="/sign-up"
                      element={
                        <App>
                          <SignUp />
                        </App>
                      }
                    />
                    <Route
                      path="/forgot-password"
                      element={
                        <App>
                          <ForgotPassword />
                        </App>
                      }
                    />

                    <Route element={<AuthGuard />}>
                      <Route
                        path="/"
                        element={
                          <App>
                            <Home />
                          </App>
                        }
                      />
                      {/* Explicit section routes so refresh preserves section */}
                      <Route
                        path="/collections"
                        element={
                          <App>
                            <Home />
                          </App>
                        }
                      />
                      <Route
                        path="/environments"
                        element={
                          <App>
                            <Home />
                          </App>
                        }
                      />
                      <Route
                        path="/bulk-test"
                        element={
                          <App>
                            <Home />
                          </App>
                        }
                      />
                      <Route
                        path="/profile"
                        element={
                          <App>
                            <SimpleUserProfile />
                          </App>
                        }
                      />
                      <Route
                        path="/change-password"
                        element={
                          <App>
                            <ChangePassword />
                          </App>
                        }
                      />
                      <Route
                        path="/delete-account"
                        element={
                          <App>
                            <DeleteAccount />
                          </App>
                        }
                      />
                      <Route
                        path="/update-profile"
                        element={
                          <App>
                            <UpdateProfile />
                          </App>
                        }
                      />
                    </Route>
                    {/* Catch-all route for unknown paths - redirect to collections */}
                    <Route
                      path="*"
                      element={<Navigate to="/collections" replace />}
                    />
                  </Routes>
                </Router>
              </ApiProvider>
            </NodeProvider>
          </EnvironmentProvider>
        </WorkspaceProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
