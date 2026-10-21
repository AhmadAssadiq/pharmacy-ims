import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { homePathForRole, ROLES } from '../utils/routes';

/**
 * A real 404 for unknown addresses (GP2 addition), in the signed-in frame or
 * the signed-out one (see UserFrame). It names the address that was asked for
 * and offers one way back: the user's home page, or the login page.
 *
 * A wrong-role page (a patient opening /staff/inventory) is not a 404 - that
 * route exists, and ProtectedRoute still sends them to their own home.
 */
export default function NotFoundPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { pathname } = useLocation();

  useEffect(() => {
    const previous = document.title;
    document.title = `${t('notFound.title')} · ${t('app.title')}`;
    return () => {
      document.title = previous;
    };
  }, [t]);

  const back = user
    ? {
        to: homePathForRole(user.role),
        label: user.role === ROLES.STAFF ? t('notFound.backStaff') : t('notFound.backPatient'),
      }
    : { to: '/login', label: t('notFound.backSignedOut') };

  const body = (
    <>
      <p className="muted">{t('notFound.lead')}</p>
      <p className="not-found__path">
        {t('notFound.requested')} <code dir="ltr">{pathname}</code>
      </p>
      <Link to={back.to} className="btn btn--primary">
        {back.label}
      </Link>
    </>
  );

  if (!user) {
    return (
      <div className="card auth-card auth-card--wide">
        <h1 className="auth-card__title">{t('notFound.title')}</h1>
        {body}
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>{t('notFound.title')}</h1>
      </div>
      <div className="card">{body}</div>
    </>
  );
}
