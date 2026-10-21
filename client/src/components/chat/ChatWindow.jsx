import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import ChatImage from './ChatImage';
import constants from '../../../../shared/constants.json';

const { CHAT_IMAGE_MAX_BYTES, CHAT_IMAGE_TYPES, CHAT_MESSAGE_MAX_LENGTH } = constants;

/**
 * Message list + composer shared by the patient chat page and the staff inbox.
 * Bubbles align with flex start/end, so mine and theirs swap sides in Arabic.
 *
 * Two different things are shown and kept apart on purpose: `presence` is
 * whether the other party is there (a dot and a label), `status` is this
 * browser's own socket. The socket is mentioned only when it is not live, as
 * plain text with no dot, so "connected" is never read as "the pharmacy is
 * available".
 */
export function PresenceMark({ online, label }) {
  return (
    <span className="presence">
      <span className={`status-dot ${online ? 'status-dot--online' : ''}`} aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * The composer can carry one image (GP2 addition). It is checked here for type
 * and size before upload, which is only a courtesy: the server sniffs the
 * bytes and decides. The text box doubles as the image's optional caption.
 */
export default function ChatWindow({
  title,
  subtitle,
  presence,
  messages,
  currentUserId,
  onSend,
  onSendImage,
  status,
  loading,
  error,
}) {
  const { t, te, formatDateTime } = useI18n();
  const [draft, setDraft] = useState('');
  const [image, setImage] = useState(null); // { file, previewUrl }
  const [sendError, setSendError] = useState(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const fileInputId = useId();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  // The preview's blob URL is released when it is replaced or the window closes.
  useEffect(() => () => image && URL.revokeObjectURL(image.previewUrl), [image]);

  const clearImage = () => {
    setImage(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handlePick = (e) => {
    const file = e.target.files?.[0];
    setSendError(null);
    if (!file) return;
    if (!CHAT_IMAGE_TYPES.includes(file.type)) {
      setSendError(t('chat.onlyImages'));
      e.target.value = '';
      return;
    }
    if (file.size > CHAT_IMAGE_MAX_BYTES) {
      setSendError(t('chat.imageTooLarge', { count: CHAT_IMAGE_MAX_BYTES / (1024 * 1024) }));
      e.target.value = '';
      return;
    }
    setImage({ file, previewUrl: URL.createObjectURL(file) });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content && !image) return;
    setSending(true);
    setSendError(null);
    try {
      if (image) await onSendImage(image.file, content);
      else await onSend(content);
      setDraft('');
      clearImage();
    } catch (err) {
      setSendError(te(err));
    } finally {
      setSending(false);
    }
  };

  const connectionNote =
    status === 'online' ? null : status === 'connecting' ? t('chat.connecting') : t('chat.reconnecting');

  return (
    <section className="card chat-window" aria-label={title}>
      <header className="chat-window__header">
        <h2>{title}</h2>
        <div className="status-line">
          {presence && <PresenceMark online={presence.online} label={presence.label} />}
          {presence && subtitle && <span aria-hidden="true">·</span>}
          {subtitle && <span>{subtitle}</span>}
        </div>
        {connectionNote && (
          <p className="chat-window__connection" role="status">
            {connectionNote}
          </p>
        )}
      </header>

      <div className="chat-window__messages" role="log" aria-live="polite">
        {loading && <p className="muted">{t('chat.loading')}</p>}
        {error && <div className="alert alert--error">{te(error)}</div>}
        {!loading && messages.length === 0 && <p className="empty">{t('chat.noMessages')}</p>}
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId;
          return (
            <div key={m.id ?? m.clientId} className={`chat-bubble ${mine ? 'chat-bubble--mine' : ''}`}>
              {m.attachment && (
                <ChatImage
                  attachment={m.attachment}
                  alt={mine ? t('chat.imageAltMine') : t('chat.imageAlt', { name: m.sender_name })}
                />
              )}
              {/* dir="auto": a message reads in its own script, whatever the UI language. */}
              {m.content && <span dir="auto">{m.content}</span>}
              <span className="chat-bubble__meta">
                {mine ? t('chat.you') : <bdi>{m.sender_name}</bdi>} · {formatDateTime(m.timestamp)}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {sendError && <div className="alert alert--error" role="alert">{sendError}</div>}
      {image && (
        <div className="chat-composer__preview">
          <img src={image.previewUrl} alt={t('chat.selectedImage')} />
          <span className="muted">{t('chat.captionHint')}</span>
          <button type="button" className="btn btn--sm btn--ghost" onClick={clearImage} disabled={sending}>
            {t('chat.removeImage')}
          </button>
        </div>
      )}
      <form className="chat-window__form" onSubmit={handleSubmit}>
        {onSendImage && (
          <>
            <input
              ref={fileRef}
              id={fileInputId}
              className="sr-only chat-window__file"
              type="file"
              accept={CHAT_IMAGE_TYPES.join(',')}
              onChange={handlePick}
              disabled={sending}
            />
            <label htmlFor={fileInputId} className="btn btn--icon chat-window__attach" title={t('chat.attachImage')}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="5.5" cy="6.25" r="1.25" fill="currentColor" />
                <path d="M2.5 12l3.5-3.5 2.5 2.5 2-2 3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
              <span className="sr-only">{t('chat.attachImage')}</span>
            </label>
          </>
        )}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={image ? t('chat.captionPlaceholder') : t('chat.placeholder')}
          aria-label={image ? t('chat.captionLabel') : t('chat.messageLabel')}
          maxLength={CHAT_MESSAGE_MAX_LENGTH}
          dir="auto"
          disabled={sending}
        />
        <button type="submit" className="btn btn--primary" disabled={sending || (!draft.trim() && !image)}>
          {sending ? t('chat.sending') : t('chat.send')}
        </button>
      </form>
    </section>
  );
}
