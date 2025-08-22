import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../store/session.jsx';

export default function AuthGuard() {
  const { token } = useAuth();
  const loc = useLocation();
  if (!token)
    return <Navigate to="/sign-in" replace state={{ from: loc.pathname }} />;
  return <Outlet />;
}
