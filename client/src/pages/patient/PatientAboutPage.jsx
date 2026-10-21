import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/I18nContext';
import { PHARMACY, localized } from '../../config/pharmacy';
import PharmacyDetails, { OpeningHours } from '../../components/PharmacyDetails';

/**
 * About the pharmacy, for patients (GP2 addition). The copy describes only
 * what this portal does; every fact about the pharmacy itself comes from
 * config/pharmacy.js, which ships with placeholders.
 */
export default function PatientAboutPage() {
  const { t, lang } = useI18n();
  const name = localized(PHARMACY.name, lang);

  return (
    <>
      <div className="page-header">
        <h1>{t('about.title', { name })}</h1>
      </div>

      <article className="card prose">
        <p className="prose__lead">{t('about.intro', { name })}</p>

        <h2>{t('about.servicesTitle')}</h2>
        <ul className="service-list">
          <li>
            <h3><Link to="/patient/availability">{t('about.availabilityTitle')}</Link></h3>
            <p>{t('about.availabilityBody')}</p>
          </li>
          <li>
            <h3><Link to="/patient/chat">{t('about.chatTitle')}</Link></h3>
            <p>{t('about.chatBody')}</p>
          </li>
          <li>
            <h3>{t('about.preorderTitle')}</h3>
            <p>{t('about.preorderBody')}</p>
          </li>
        </ul>

        <h2>{t('about.hoursTitle')}</h2>
        <OpeningHours />

        <h2>{t('about.findUsTitle')}</h2>
        <PharmacyDetails />

        {PHARMACY.licenceNumber && (
          <p className="muted prose__fine">
            {t('about.licence', { number: PHARMACY.licenceNumber })}
          </p>
        )}
        <p>
          <Link to="/contact">{t('about.contactLink')}</Link>
        </p>
      </article>
    </>
  );
}
