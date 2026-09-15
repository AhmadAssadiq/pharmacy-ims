import { useCallback, useEffect, useState } from 'react';
import { fetchMessages, openMySession, postMessage } from '../../api/chat';
import ChatWindow from '../../components/chat/ChatWindow';
import { useAuth } from '../../context/AuthContext';
import useChatSocket from '../../hooks/useChatSocket';

/**
 * Patient chat with the pharmacy (FR 5, UC-2). The patient's single session
 * is opened (or created) on load; new messages arrive over the WebSocket.
 */
export default function PatientChatPage() {
  const { user } = useAuth();
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { session: opened } = await openMySession();
        const { messages: history } = await fetchMessages(opened.id);
        if (cancelled) return;
        setSession(opened);
        setMessages(history);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleEvent = useCallback(
    (frame) => {
      if (frame.type !== 'message' || !session || frame.message.chat_session_id !== session.id) return;
      setMessages((prev) => (prev.some((m) => m.id === frame.message.id) ? prev : [...prev, frame.message]));
    },
    [session]
  );

  const { status, send } = useChatSocket(handleEvent);

  const handleSend = async (content) => {
    // Prefer the live socket; fall back to HTTP when it is reconnecting.
    const sent = send({ type: 'message', sessionId: session.id, content });
    if (!sent) {
      const { message } = await postMessage(session.id, content);
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    }
  };

  return (
    <>
      <div className="page-header">
        <h1>Chat with pharmacy</h1>
      </div>
      <ChatWindow
        title="Pharmacy staff"
        subtitle={session?.staff_id ? 'A pharmacist has joined' : 'Waiting for a pharmacist'}
        messages={messages}
        currentUserId={user.id}
        onSend={handleSend}
        status={status}
        loading={loading}
        error={error}
      />
    </>
  );
}
