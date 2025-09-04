import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import App from './App.jsx';
import AuthGuard from './components/AuthGuard.jsx';
import { ThemeProvider } from './components/ThemeProvider.jsx';
import SignIn from './pages/SignIn.jsx';
import SignUp from './pages/SignUp.jsx';
import { NodeProvider } from './store/node.jsx';
import { AuthProvider } from './store/session.jsx';
import { WorkspaceProvider } from './store/workspace.jsx';
import './styles/global.css';

import ChangePassword from './features/auth/components/ChangePassword.jsx';
import DeleteAccount from './features/auth/components/DeleteAccount.jsx';
import ForgotPassword from './features/auth/components/ForgotPassword.jsx';
import SimpleUserProfile from './features/auth/components/SimpleUserProfile.jsx';
import UpdateProfile from './features/auth/components/UpdateProfile.jsx';
import Home from './pages/Home/Home.jsx';

import { ApiProvider } from './store/api.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <NodeProvider>
            <ApiProvider>
              <BrowserRouter
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
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Route>
                </Routes>
              </BrowserRouter>
            </ApiProvider>
          </NodeProvider>
        </WorkspaceProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
<SignIn />;
