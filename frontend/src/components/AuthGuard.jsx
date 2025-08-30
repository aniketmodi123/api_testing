import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../store/session.jsx';
import { forceLogout, isTokenExpired } from '../utils/authUtils';

export default function AuthGuard() {
  const { token } = useAuth();
  const loc = useLocation();

  // If no token exists, simply redirect to sign-in
  if (!token) {
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

  return <Outlet />;
}
