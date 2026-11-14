// The prescription photo of an order (GP2 addition). Like a chat image, it needs the login
// token, so it is downloaded as a Blob and shown from a temporary blob: URL.
// Only staff and the patient who placed the order can load it (the server checks).
import { useEffect, useState } from 'react';
import { fetchPrescription } from '../../api/preorders';
import { useI18n } from '../../i18n/useI18n';

export default function PrescriptionImage({ orderId }) {
  const { t } = useI18n();
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    fetchPrescription(orderId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    // Release the temporary URL when the image is no longer shown
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [orderId]);

  if (failed) return <p className="muted">{t('orders.prescriptionLoadFailed')}</p>;
  if (!url) return <p className="muted">{t('common.loading')}</p>;

  return (
    <a className="prescription-image" href={url} target="_blank" rel="noopener noreferrer" title={t('chat.openImage')}>
      <img src={url} alt={t('orders.prescriptionAlt')} />
    </a>
  );
}
