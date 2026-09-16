import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../utils/routes';

const STAFF_LINKS = [
  { to: '/staff/inventory', label: 'Inventory' },
  { to: '/staff/stock', label: 'Add stock' },
  { to: '/staff/sell', label: 'Dispense' },
  { to: '/staff/forecast', label: 'Forecast' },
  { to: '/staff/chat', label: 'Chat inbox' },
];

const PATIENT_LINKS = [
  { to: '/patient/availability', label: 'Medication availability' },
  { to: '/patient/chat', label: 'Chat with pharmacy' },
];

/** Page frame with the role-specific navigation bar. */
export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = user.role === ROLES.STAFF ? STAFF_LINKS : PATIENT_LINKS;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__brand">Pharmacy IMS</div>
        <nav className="topbar__nav" aria-label="Main navigation">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} className="topbar__link">
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar__user">
          <span className="topbar__name">
            {user.name} <span className="badge badge--role">{user.role}</span>
          </span>
          <button type="button" className="btn btn--ghost" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
