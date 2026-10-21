import { Link, Outlet } from 'react-router-dom';
import { useI18n } from '../i18n/I18nContext';
import LanguageToggle from './LanguageToggle';
import ThemeToggle from './ThemeToggle';

/**
 * Frame for the signed-out pages (Login, Register). They have no navigation bar,
 * but they still need the same skip link and `<main>` landmark as `Layout`, so
 * assistive technology finds the form the same way it finds every other page.
 * A patient picks a language before signing in, so the switches live here too.
 */
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
