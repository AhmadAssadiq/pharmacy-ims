import { useEffect, useRef, useState } from 'react';

function formatTime(timestamp) {
  const date = new Date(String(timestamp).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Message list + composer shared by the patient chat page and the staff inbox.
 */
export default function ChatWindow({ title, subtitle, messages, currentUserId, onSend, status, loading, error }) {
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
      setSendError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="card chat-window" aria-label={title}>
      <header className="chat-window__header">
        <h2>{title}</h2>
        <div className="status-line">
          {subtitle && <span>{subtitle} · </span>}
          <span className={`status-dot ${status === 'online' ? 'status-dot--online' : ''}`} />
          {status === 'online' ? 'Live' : status === 'connecting' ? 'Connecting...' : 'Reconnecting...'}
        </div>
      </header>

      <div className="chat-window__messages" role="log" aria-live="polite">
        {loading && <p className="muted">Loading messages...</p>}
        {error && <div className="alert alert--error">{error}</div>}
        {!loading && messages.length === 0 && <p className="empty">No messages yet. Say hello!</p>}
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId;
          return (
            <div key={m.id ?? m.clientId} className={`chat-bubble ${mine ? 'chat-bubble--mine' : ''}`}>
              {m.content}
              <span className="chat-bubble__meta">
                {mine ? 'You' : m.sender_name} · {formatTime(m.timestamp)}
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
          placeholder="Type a message"
          aria-label="Message"
          maxLength={2000}
          disabled={sending}
        />
        <button type="submit" className="btn btn--primary" disabled={sending || !draft.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
