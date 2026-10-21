import { useI18n } from '../i18n/I18nContext';
import { PHARMACY, localized, mapsUrl } from '../config/pharmacy';

/** Opening hours as a definition list; a day with null hours reads "Closed". */
export function OpeningHours() {
  const { t, lang } = useI18n();
  return (
    <dl className="hours">
      {PHARMACY.openingHours.map((row) => (
        <div key={row.days.en} className="hours__row">
          <dt>{localized(row.days, lang)}</dt>
          <dd className="num" dir="ltr">{row.hours ?? t('pharmacy.closed')}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * How to reach the pharmacy (GP2 addition): phone as a tel: link, email as a
 * mailto: link, the address with a plain "Open in Maps" link, all from
 * config/pharmacy.js. Shared by the About and Contact pages.
 */
export default function PharmacyDetails() {
  const { t, lang } = useI18n();
  return (
    <dl className="contact-list">
      <div>
        <dt>{t('pharmacy.phone')}</dt>
        <dd>
          <a href={`tel:${PHARMACY.phoneDial}`} dir="ltr">{PHARMACY.phone}</a>
        </dd>
      </div>
      <div>
        <dt>{t('pharmacy.email')}</dt>
        <dd>
          <a href={`mailto:${PHARMACY.email}`} dir="ltr">{PHARMACY.email}</a>
        </dd>
      </div>
      <div>
        <dt>{t('pharmacy.address')}</dt>
        <dd>
          <address>{localized(PHARMACY.address, lang)}</address>
          <a href={mapsUrl()} target="_blank" rel="noopener noreferrer">
            {t('pharmacy.openInMaps')}
          </a>
        </dd>
      </div>
    </dl>
  );
}
