import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import App from './App.jsx';
import AuthGuard from './components/AuthGuard.jsx';
import { ThemeProvider } from './components/ThemeProvider.jsx';
import SignIn from './pages/SignIn.jsx';
import SignUp from './pages/SignUp.jsx';
import { AuthProvider } from './store/session';
import './styles/global.css';

import Home from './pages/Home/Home.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
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
            <Route element={<AuthGuard />}>
              <Route
                path="/"
                element={
                  <App>
                    <Home />
                  </App>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
<SignIn />;
