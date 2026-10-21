import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { ROLES } from '../utils/routes';
import { PHARMACY, localized } from '../config/pharmacy';
import PharmacyDetails, { OpeningHours } from '../components/PharmacyDetails';

/**
 * Contact the pharmacy (GP2 addition), signed in or out (see UserFrame).
 *
 * A signed-in patient's first choice is the chat they already have, so there
 * is no second inbox. Everyone else sees the details only. There is
 * deliberately no anonymous contact form: it would need its own table, a
 * staff view, rate limiting and spam handling.
 */
export default function ContactPage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const name = localized(PHARMACY.name, lang);
  const isPatient = user?.role === ROLES.PATIENT;

  const content = (
    <>
      {isPatient && (
        <div className="contact-primary">
          <p>{t('contact.patientLead')}</p>
          <Link to="/patient/chat" className="btn btn--primary">
            {t('contact.messagePharmacy')}
          </Link>
        </div>
      )}
      {!user && <p className="muted">{t('contact.signedOutLead')}</p>}

      <h2>{t('contact.detailsTitle')}</h2>
      <PharmacyDetails />

      <h2>{t('about.hoursTitle')}</h2>
      <OpeningHours />
    </>
  );

  if (!user) {
    return (
      <div className="card auth-card auth-card--wide prose">
        <h1 className="auth-card__title">{t('contact.title', { name })}</h1>
        {content}
        <p className="muted auth-card__footer">
          <Link to="/login">{t('reset.backToLogin')}</Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>{t('contact.title', { name })}</h1>
      </div>
      <article className="card prose">{content}</article>
    </>
  );
}
