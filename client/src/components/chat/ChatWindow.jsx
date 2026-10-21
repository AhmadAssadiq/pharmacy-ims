import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';

/**
 * Message list + composer shared by the patient chat page and the staff inbox.
 * Bubbles align with flex start/end, so mine and theirs swap sides in Arabic.
 */
export default function ChatWindow({ title, subtitle, messages, currentUserId, onSend, status, loading, error }) {
  const { t, te, formatDateTime } = useI18n();
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setSending(true);
    setSendError(null);
    try {
      await onSend(content);
      setDraft('');
    } catch (err) {
      setSendError(te(err));
    } finally {
      setSending(false);
    }
  };

  const statusLabel =
    status === 'online' ? t('chat.live') : status === 'connecting' ? t('chat.connecting') : t('chat.reconnecting');

  return (
    <section className="card chat-window" aria-label={title}>
      <header className="chat-window__header">
        <h2>{title}</h2>
        <div className="status-line">
          {subtitle && <span>{subtitle} · </span>}
          <span className={`status-dot ${status === 'online' ? 'status-dot--online' : ''}`} />
          {statusLabel}
        </div>
      </header>

      <div className="chat-window__messages" role="log" aria-live="polite">
        {loading && <p className="muted">{t('chat.loading')}</p>}
        {error && <div className="alert alert--error">{te(error)}</div>}
        {!loading && messages.length === 0 && <p className="empty">{t('chat.noMessages')}</p>}
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId;
          return (
            <div key={m.id ?? m.clientId} className={`chat-bubble ${mine ? 'chat-bubble--mine' : ''}`}>
              {/* dir="auto": a message reads in its own script, whatever the UI language. */}
              <span dir="auto">{m.content}</span>
              <span className="chat-bubble__meta">
                {mine ? t('chat.you') : <bdi>{m.sender_name}</bdi>} · {formatDateTime(m.timestamp)}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {sendError && <div className="alert alert--error" role="alert">{sendError}</div>}
      <form className="chat-window__form" onSubmit={handleSubmit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('chat.placeholder')}
          aria-label={t('chat.messageLabel')}
          maxLength={2000}
          dir="auto"
          disabled={sending}
        />
        <button type="submit" className="btn btn--primary" disabled={sending || !draft.trim()}>
          {t('chat.send')}
        </button>
      </form>
    </section>
  );
}
