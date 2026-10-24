import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { ROLES } from '../utils/routes';
import Clock from './Clock';
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

/** Page frame with the role-specific navigation bar. */
export default function Layout() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
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
        {t('app.skipToContent')}
      </a>
      <header className="topbar">
        <span className="topbar__brand">
          <Mark />
          {t('app.brand')}
          <span className="topbar__scope">{isStaff ? t('nav.scopeStaff') : t('nav.scopePatient')}</span>
        </span>
        <nav className="topbar__nav" aria-label={t('nav.main')}>
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} className="topbar__link">
              {t(link.label)}
            </NavLink>
          ))}
        </nav>
        <div className="topbar__user">
          <Clock />
          <LanguageToggle />
          <ThemeToggle />
          {isStaff ? (
            <span className="topbar__who">
              <span>{user.name}</span>
              <span className="topbar__role">{t('nav.roleStaff')}</span>
            </span>
          ) : (
            // A patient's name opens their account page (delete account lives there).
            <Link to="/patient/account" className="topbar__who topbar__who--link" title={t('account.linkTitle')}>
              <span><bdi>{user.name}</bdi></span>
              <span className="topbar__role">{t('account.linkLabel')}</span>
            </Link>
          )}
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
  );
}
