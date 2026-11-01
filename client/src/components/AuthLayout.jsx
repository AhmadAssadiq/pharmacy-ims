// The frame around the signed-out pages (login, register, password reset): no navigation
// bar, just the contact link and the language and theme buttons at the top.
import { Link, Outlet } from 'react-router-dom';
import { useI18n } from '../i18n/useI18n';
import LanguageToggle from './LanguageToggle';
import ThemeToggle from './ThemeToggle';

export default function AuthLayout() {
  const { t } = useI18n();
  return (
    <>
      <a className="skip-link" href="#main">
        {t('app.skipToContent')}
      </a>
      <div className="auth-bar">
        <Link to="/contact" className="btn btn--ghost btn--sm">
          {t('nav.contact')}
        </Link>
        <LanguageToggle />
        <ThemeToggle />
      </div>
      <main className="auth-page" id="main">
        <Outlet />
      </main>
    </>
  );
}
