import { useCallback, useEffect, useState } from 'react';
import { fetchMessages, openMySession, postImage, postMessage } from '../../api/chat';
import ChatWindow from '../../components/chat/ChatWindow';
import { useAuth } from '../../context/AuthContext';
import useChatSocket from '../../hooks/useChatSocket';
import { useI18n } from '../../i18n/I18nContext';

/**
 * Patient chat with the pharmacy (FR 5, UC-2). The patient's single session
 * is opened (or created) on load; new messages arrive over the WebSocket.
 */
export default function PatientChatPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Whether anyone at the pharmacy is connected: null until the hub says.
  const [pharmacyOnline, setPharmacyOnline] = useState(null);

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
        if (!cancelled) setError(err);
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
      if (frame.type === 'ready') return setPharmacyOnline(Boolean(frame.presence?.pharmacyOnline));
      if (frame.type === 'presence' && frame.scope === 'pharmacy') return setPharmacyOnline(frame.online);
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

  const handleSendImage = async (file, caption) => {
    const { message } = await postImage(session.id, file, caption);
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
  };

  // While our own socket is down the pharmacy's presence is unknown, not "offline".
  const known = status === 'online' && pharmacyOnline !== null;
  const presence = {
    online: known && pharmacyOnline,
    label: !known ? t('presence.unknown') : pharmacyOnline ? t('presence.pharmacyOnline') : t('presence.pharmacyOffline'),
  };

  return (
    <>
      <div className="page-header">
        <h1>{t('chat.patientTitle')}</h1>
      </div>
      <ChatWindow
        title={t('chat.staffWindowTitle')}
        subtitle={session?.staff_id ? t('chat.pharmacistJoined') : t('chat.waitingForPharmacist')}
        presence={presence}
        messages={messages}
        currentUserId={user.id}
        onSend={handleSend}
        onSendImage={handleSendImage}
        status={status}
        loading={loading}
        error={error}
      />
    </>
  );
}
