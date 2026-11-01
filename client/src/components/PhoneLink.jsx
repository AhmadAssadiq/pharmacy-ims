// A patient's phone number as a tap-to-call link for staff (GP2 addition), or "no phone
// number" when there is none.
import { useI18n } from '../i18n/useI18n';

export default function PhoneLink({ phone }) {
  const { t } = useI18n();
  if (!phone) return <span className="muted">{t('phone.none')}</span>;
  return (
    <a href={`tel:${phone}`} dir="ltr" aria-label={t('phone.callLabel', { phone })}>
      {phone}
    </a>
  );
}
