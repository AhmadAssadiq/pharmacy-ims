// Guards the staff and patient pages: if you are not signed in you go to the login page
// (FR 1); if you have the wrong role you go to your own home page (FR 2).
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homePathForRole } from '../utils/routes';

export default function ProtectedRoute({ role }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && user.role !== role) return <Navigate to={homePathForRole(user.role)} replace />;
  return <Outlet />;
}
