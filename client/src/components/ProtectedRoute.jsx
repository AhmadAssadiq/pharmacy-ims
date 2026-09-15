import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homePathForRole } from '../utils/routes';

/**
 * Guards a group of routes. Unauthenticated users are sent to the login page
 * (FR 1); authenticated users with the wrong role are sent to their own home
 * page (FR 2).
 */
export default function ProtectedRoute({ role }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && user.role !== role) return <Navigate to={homePathForRole(user.role)} replace />;
  return <Outlet />;
}
