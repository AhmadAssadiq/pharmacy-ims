import { useI18n } from '../i18n/I18nContext';

/**
 * A patient's phone number as a tap-to-call link for staff (GP2 addition), or
 * a plain note when the patient has not given one yet. Numbers always read
 * left to right, Arabic page or not.
 */
export default function PhoneLink({ phone }) {
  const { t } = useI18n();
  if (!phone) return <span className="muted">{t('phone.none')}</span>;
  return (
    <a href={`tel:${phone}`} dir="ltr" aria-label={t('phone.callLabel', { phone })}>
      {phone}
    </a>
  );
}
