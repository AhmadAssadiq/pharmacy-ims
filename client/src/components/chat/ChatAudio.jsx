// A voice message inside a chat bubble (GP2 addition). Like a chat image, the recording
// needs the login token, so it is downloaded as a Blob and played from a temporary blob: URL.
import { useEffect, useState } from 'react';
import { fetchAttachment } from '../../api/chat';
import { useI18n } from '../../i18n/useI18n';

export default function ChatAudio({ attachment, label }) {
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
    // Release the temporary URL when the message is no longer shown
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id]);

  if (failed) return <span className="chat-audio chat-audio--failed">{t('chat.voiceLoadFailed')}</span>;
  if (!url) return <span className="chat-audio muted">{t('chat.voiceLoading')}</span>;

  // The browser's own player: play, pause and a progress bar
  return <audio className="chat-audio" controls preload="metadata" src={url} aria-label={label} />;
}
