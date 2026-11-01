// An image inside a chat message (GP2 addition). Images need the login token, so it is
// downloaded as a Blob and shown from a temporary blob: URL. Clicking it opens it full size.
import { useEffect, useState } from 'react';
import { fetchAttachment } from '../../api/chat';
import { useI18n } from '../../i18n/useI18n';

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
