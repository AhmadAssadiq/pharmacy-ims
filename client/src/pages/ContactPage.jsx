// The Contact page (GP2 addition): the pharmacy's details, plus a link to the chat for
// signed-in patients. Anyone can open it.
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/useI18n';
import { ROLES } from '../utils/routes';
import { PHARMACY, localized } from '../config/pharmacy';
import PharmacyDetails, { OpeningHours } from '../components/PharmacyDetails';

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
