import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../store/session.jsx';
import { forceLogout, isTokenExpired } from '../utils/authUtils';

export default function AuthGuard() {
  const auth = useAuth();
  const token = auth?.token;
  const isInitialized = auth?.isInitialized;
  const loc = useLocation();

  // Show loading state while auth context is initializing
  if (!isInitialized) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
        }}
      >
        Loading...
      </div>
    );
  }

  // If auth context is missing or no token exists, redirect to sign-in
  if (!auth || !token) {
    return <Navigate to="/sign-in" replace state={{ from: loc.pathname }} />;
  }

  // If token exists but is expired, force logout
  if (isTokenExpired(token)) {
    // Use forceLogout for a direct approach
    setTimeout(() => forceLogout(), 0);
    return null; // Return null to avoid flickering during redirect
  }

  // If we got here, the token is valid
  return <Outlet />;
}
