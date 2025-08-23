import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import App from './App.jsx';
import AuthGuard from './components/AuthGuard.jsx';
import { ThemeProvider } from './components/ThemeProvider.jsx';
import SignIn from './pages/SignIn.jsx';
import SignUp from './pages/SignUp.jsx';
import { AuthProvider } from './store/session.jsx';
import { WorkspaceProvider } from './store/workspace.jsx';
import './styles/global.css';

import ChangePassword from './features/auth/components/ChangePassword.jsx';
import DeleteAccount from './features/auth/components/DeleteAccount.jsx';
import ForgotPassword from './features/auth/components/ForgotPassword.jsx';
import UserProfile from './features/auth/components/UserProfile.jsx';
import Home from './pages/Home/Home.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <BrowserRouter>
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
                      <UserProfile />
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
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </WorkspaceProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
<SignIn />;
