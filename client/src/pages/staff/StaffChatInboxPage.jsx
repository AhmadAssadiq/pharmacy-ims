import { useCallback, useEffect, useState } from 'react';
import { fetchMessages, fetchSessions, postMessage } from '../../api/chat';
import ChatWindow from '../../components/chat/ChatWindow';
import { useAuth } from '../../context/AuthContext';
import useChatSocket from '../../hooks/useChatSocket';

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(String(timestamp).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Staff unified inbox (FR 5.2): every patient session in one list, with the
 * selected conversation on the right. Incoming messages update both without
 * a page refresh.
 */
export default function StaffChatInboxPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSessions()
      .then((data) => setSessions(data.sessions))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingSessions(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoadingMessages(true);
    fetchMessages(selectedId)
      .then((data) => {
        if (!cancelled) setMessages(data.messages);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const handleEvent = useCallback(
    (frame) => {
      if (frame.type !== 'message') return;
      const { message, session } = frame;

      // Update the inbox summary (and add the session if it is new).
      setSessions((prev) => {
        const rest = prev.filter((s) => s.id !== session.id);
        const existing = prev.find((s) => s.id === session.id);
        const updated = {
          ...(existing || { id: session.id, patient_id: session.patient_id, created_at: session.created_at }),
          patient_name: session.patient_name,
          staff_id: session.staff_id,
          last_message: message.content,
          last_message_at: message.timestamp,
        };
        return [updated, ...rest];
      });

      if (message.chat_session_id === selectedId) {
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      }
    },
    [selectedId]
  );

  const { status, send } = useChatSocket(handleEvent);

  const handleSend = async (content) => {
    const sent = send({ type: 'message', sessionId: selectedId, content });
    if (!sent) {
      const { message } = await postMessage(selectedId, content);
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    }
  };

  const selected = sessions.find((s) => s.id === selectedId);

  return (
    <>
      <div className="page-header">
        <h1>Chat inbox</h1>
        <div className="status-line">{sessions.length} active session{sessions.length === 1 ? '' : 's'}</div>
      </div>
      {error && <div className="alert alert--error" role="alert">{error}</div>}

      <div className="chat-layout">
        <aside className="card" aria-label="Chat sessions">
          <h2>Patients</h2>
          {loadingSessions && <p className="muted">Loading sessions...</p>}
          {!loadingSessions && sessions.length === 0 && <p className="empty">No chat sessions yet.</p>}
          <ul className="list">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`list__item list__item--button ${s.id === selectedId ? 'is-active' : ''}`}
                  onClick={() => setSelectedId(s.id)}
                >
                  <span>
                    <strong>{s.patient_name}</strong>
                    <br />
                    <span className="muted" style={{ fontSize: '0.85rem' }}>
                      {s.last_message ? s.last_message.slice(0, 40) : 'No messages yet'}
                    </span>
                  </span>
                  <span className="muted" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                    {formatTime(s.last_message_at || s.created_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {selected ? (
          <ChatWindow
            title={selected.patient_name}
            subtitle={selected.staff_id ? 'Assigned' : 'Unassigned'}
            messages={messages}
            currentUserId={user.id}
            onSend={handleSend}
            status={status}
            loading={loadingMessages}
          />
        ) : (
          <section className="card">
            <p className="empty">Select a patient to view the conversation.</p>
          </section>
        )}
      </div>
    </>
  );
}
