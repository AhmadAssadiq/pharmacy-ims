import { useEffect, useState } from 'react';
import { fetchAttachment } from '../../api/chat';
import { useI18n } from '../../i18n/I18nContext';

/**
 * An image in a chat bubble (GP2 addition). The file sits behind an
 * authenticated route, so it is fetched with the bearer token, shown from a
 * blob URL, and the URL is revoked when the bubble unmounts. Clicking opens it
 * full size in a new tab. The alt text names who sent it, never the filename.
 */
export default function ChatImage({ attachment, alt }) {
  const { t } = useI18n();
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    fetchAttachment(attachment.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id]);

  if (failed) return <span className="chat-image chat-image--failed">{t('chat.imageLoadFailed')}</span>;
  if (!url) return <span className="chat-image chat-image--loading" aria-label={t('chat.imageLoading')} role="img" />;

  return (
    <a className="chat-image" href={url} target="_blank" rel="noopener noreferrer" title={t('chat.openImage')}>
      <img src={url} alt={alt} />
    </a>
  );
}
