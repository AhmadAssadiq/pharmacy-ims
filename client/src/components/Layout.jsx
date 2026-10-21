import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../utils/routes';
import Clock from './Clock';

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

/** The product's mark: a dispensing cross, drawn rather than imported. */
function Mark() {
  return (
    <svg className="topbar__mark" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <rect width="18" height="18" rx="4" fill="#141414" />
      <path d="M6 9h6M9 6v6" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Page frame with the role-specific navigation bar. */
export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isStaff = user.role === ROLES.STAFF;
  const links = isStaff ? STAFF_LINKS : PATIENT_LINKS;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <span className="topbar__brand">
          <Mark />
          Pharmacy IMS
          <span className="topbar__scope">{isStaff ? 'Dispensary' : 'Patient portal'}</span>
        </span>
        <nav className="topbar__nav" aria-label="Main navigation">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} className="topbar__link">
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar__user">
          <Clock locale="en-GB" />
          <span className="topbar__who">
            <span>{user.name}</span>
            <span className="topbar__role">{isStaff ? 'Staff' : 'Patient'}</span>
          </span>
          <button type="button" className="btn btn--sm" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>
      <main className="page" id="main">
        <Outlet />
      </main>
    </div>
  );
}
