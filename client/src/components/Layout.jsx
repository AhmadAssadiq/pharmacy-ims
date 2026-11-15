// The frame around every signed-in page: the top bar with the navigation links for the
// user's role (staff or patient), the notification bell, the clock, language and theme
// buttons, the user's name and Log out. The page itself appears where <Outlet /> is.
//
// On a phone the links fold away behind a "Menu" button (GP2 addition), so the top bar
// does not fill the screen.
// The frame also opens the app's one live connection to the server (SocketProvider), which
// the bell and the chat pages share.
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SocketProvider } from '../context/SocketContext';
import { useI18n } from '../i18n/useI18n';
import { ROLES } from '../utils/routes';
import Clock from './Clock';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ThemeToggle';
import LanguageToggle from './LanguageToggle';

const STAFF_LINKS = [
  { to: '/staff/inventory', label: 'nav.inventory' },
  { to: '/staff/stock', label: 'nav.addStock' },
  { to: '/staff/sell', label: 'nav.dispense' },
  { to: '/staff/preorders', label: 'nav.preorders' },
  { to: '/staff/forecast', label: 'nav.forecast' },
  { to: '/staff/chat', label: 'nav.chatInbox' },
];

const PATIENT_LINKS = [
  { to: '/patient/availability', label: 'nav.availability' },
  { to: '/patient/orders', label: 'nav.myOrders' },
  { to: '/patient/chat', label: 'nav.patientChat' },
  { to: '/patient/about', label: 'nav.about' },
  { to: '/contact', label: 'nav.contact' },
];

/** The product's mark: a dispensing cross, drawn in the chrome tokens so it follows the theme. */
function Mark() {
  return (
    <svg className="topbar__mark" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <rect width="18" height="18" rx="4" fill="var(--accent)" />
      <path d="M6 9h6M9 6v6" stroke="var(--on-accent)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const isStaff = user.role === ROLES.STAFF;
  const links = isStaff ? STAFF_LINKS : PATIENT_LINKS;
  const accountPath = isStaff ? '/staff/account' : '/patient/account';
  // On a phone: whether the links are showing (the "Menu" button opens and closes them)
  const [menuOpen, setMenuOpen] = useState(false);

  // Fold the menu away again whenever another page opens
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <SocketProvider>
      <div className="app-shell">
        <a className="skip-link" href="#main">
          {t('app.skipToContent')}
        </a>
        <header className="topbar">
          <span className="topbar__brand">
            <Mark />
            {t('app.brand')}
            <span className="topbar__scope">{isStaff ? t('nav.scopeStaff') : t('nav.scopePatient')}</span>
          </span>

          {/* Only shown on a phone (see styles.css): opens and closes the links below */}
          <button
            type="button"
            className="btn btn--sm topbar__menu"
            aria-expanded={menuOpen}
            aria-controls="main-navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {/* Three lines: the usual "menu" sign */}
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            {t('nav.menu')}
          </button>

          <nav
            id="main-navigation"
            className={`topbar__nav ${menuOpen ? 'is-open' : ''}`}
            aria-label={t('nav.main')}
          >
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} className="topbar__link">
                {t(link.label)}
              </NavLink>
            ))}
            {/* On a phone the user's name is hidden, so the account page is linked here */}
            <NavLink to={accountPath} className="topbar__link topbar__link--phone">
              {t('account.linkLabel')}
            </NavLink>
          </nav>

          <div className="topbar__user">
            <NotificationBell />
            <Clock />
            <LanguageToggle />
            <ThemeToggle />
            {/* The user's name opens their account page (change password; patients can
                also change their phone number and delete their account there) */}
            <Link to={accountPath} className="topbar__who topbar__who--link" title={t('account.linkTitle')}>
              <span><bdi>{user.name}</bdi></span>
              <span className="topbar__role">{isStaff ? t('nav.roleStaff') : t('account.linkLabel')}</span>
            </Link>
            <button type="button" className="btn btn--sm" onClick={handleLogout}>
              {t('nav.logout')}
            </button>
          </div>
        </header>
        <main className="page" id="main">
          {/* Patients who registered before phone numbers were required are asked for one. */}
          {!isStaff && !user.phone && (
            <div className="alert alert--warning phone-banner" role="status">
              <span>{t('phone.missingBanner')}</span>{' '}
              <Link to="/patient/account#phone">{t('phone.addNow')}</Link>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </SocketProvider>
  );
}
