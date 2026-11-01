// The staff chat inbox (FR 5.2): every patient conversation in one list, and the chosen
// conversation next to it. New messages and online dots update live, without refreshing.
import { useEffect, useState } from 'react';
import { fetchMessages, fetchSessions, postImage, postMessage } from '../../api/chat';
import ChatWindow, { PresenceMark } from '../../components/chat/ChatWindow';
import PhoneLink from '../../components/PhoneLink';
import { useAuth } from '../../context/AuthContext';
import useChatSocket, { addMessageIfNew } from '../../hooks/useChatSocket';
import { useI18n } from '../../i18n/useI18n';

export default function StaffChatInboxPage() {
  const { user } = useAuth();
  const { t, te, formatDateTime } = useI18n();
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState(null);
  // Which patients are online: { patientId: true/false }
  const [onlinePatients, setOnlinePatients] = useState({});

  // On load: the list of conversations (each says whether its patient is online)
  useEffect(() => {
    fetchSessions()
      .then((data) => {
        setSessions(data.sessions);
        const online = {};
        for (const session of data.sessions) {
          online[session.patient_id] = session.online;
        }
        // Live updates that already arrived win over this first list
        setOnlinePatients((current) => ({ ...online, ...current }));
      })
      .catch((loadError) => setError(loadError))
      .finally(() => setLoadingSessions(false));
  }, []);

  // When a conversation is chosen: load its messages
  useEffect(() => {
    if (!selectedId) {
      return;
    }
    let isStillSelected = true; // ignore the answer if another conversation was chosen meanwhile
    setLoadingMessages(true);
    fetchMessages(selectedId)
      .then((data) => {
        if (isStillSelected) setMessages(data.messages);
      })
      .catch((loadError) => {
        if (isStillSelected) setError(loadError);
      })
      .finally(() => {
        if (isStillSelected) setLoadingMessages(false);
      });
    return () => {
      isStillSelected = false;
    };
  }, [selectedId]);

  // Moves a conversation to the top of the list with its newest message
  // (and adds it if it is a new conversation)
  function updateInbox(message, session) {
    setSessions((current) => {
      const existing = current.find((item) => item.id === session.id);
      const others = current.filter((item) => item.id !== session.id);
      const updated = {
        id: session.id,
        patient_id: session.patient_id,
        created_at: existing ? existing.created_at : session.created_at,
        patient_name: session.patient_name,
        patient_phone: session.patient_phone ?? (existing ? existing.patient_phone : null),
        staff_id: session.staff_id,
        staff_name: existing ? existing.staff_name : undefined,
        last_message: message.content,
        last_message_has_image: Boolean(message.attachment),
        last_message_at: message.timestamp,
      };
      return [updated, ...others];
    });
  }

  // Everything the chat server sends us
  function handleEvent(event) {
    if (event.type === 'ready') {
      // The list in 'ready' is everyone online right now: everybody else is offline
      const online = {};
      for (const patientId of Object.keys(onlinePatients)) {
        online[patientId] = false;
      }
      for (const patientId of event.presence.patients) {
        online[patientId] = true;
      }
      setOnlinePatients(online);
    } else if (event.type === 'presence' && event.scope === 'patient') {
      setOnlinePatients((current) => ({ ...current, [event.userId]: event.online }));
    } else if (event.type === 'message') {
      updateInbox(event.message, event.session);
      if (event.message.chat_session_id === selectedId) {
        setMessages((current) => addMessageIfNew(current, event.message));
      }
    }
  }

  const { status, sendMessage } = useChatSocket(handleEvent);

  // Send over the live connection; if it is down, send through the normal API instead
  async function handleSend(text) {
    let message;
    if (status === 'online') {
      message = await sendMessage(selectedId, text);
    } else {
      message = (await postMessage(selectedId, text)).message;
    }
    setMessages((current) => addMessageIfNew(current, message));
  }

  // Images always go through the normal API
  async function handleSendImage(file, caption) {
    const result = await postImage(selectedId, file, caption);
    setMessages((current) => addMessageIfNew(current, result.message));
  }

  // A patient counts as online only while our own connection is up
  function isOnline(patientId) {
    return status === 'online' && Boolean(onlinePatients[patientId]);
  }

  function presenceLabel(patientId) {
    return isOnline(patientId) ? t('presence.patientOnline') : t('presence.patientOffline');
  }

  // The preview text under a patient's name in the list
  function lastMessagePreview(session) {
    if (session.last_message) {
      return <bdi>{session.last_message.slice(0, 40)}</bdi>;
    }
    if (session.last_message_has_image) {
      return t('chat.imagePreview');
    }
    return t('chat.noMessagesYet');
  }

  const selected = sessions.find((session) => session.id === selectedId);

  return (
    <>
      <div className="page-header">
        <h1>{t('chat.inboxTitle')}</h1>
        <div className="status-line">{t('chat.activeSessions', { count: sessions.length })}</div>
      </div>
      {error && <div className="alert alert--error" role="alert">{te(error)}</div>}

      <div className="chat-layout">
        <aside className="card" aria-label={t('chat.sessionsLabel')}>
          <h2>{t('chat.patients')}</h2>
          {loadingSessions && <p className="muted">{t('chat.loadingSessions')}</p>}
          {!loadingSessions && sessions.length === 0 && <p className="empty">{t('chat.noSessions')}</p>}
          <ul className="list">
            {sessions.map((session) => (
              <li key={session.id}>
                <button
                  type="button"
                  className={`list__item list__item--button ${session.id === selectedId ? 'is-active' : ''}`}
                  onClick={() => setSelectedId(session.id)}
                >
                  <span>
                    <strong><bdi>{session.patient_name}</bdi></strong>{' '}
                    <PresenceMark online={isOnline(session.patient_id)} label={presenceLabel(session.patient_id)} />
                    <br />
                    <span className="muted" style={{ fontSize: '0.85rem' }}>
                      {lastMessagePreview(session)}
                    </span>
                  </span>
                  <span className="muted" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                    {formatDateTime(session.last_message_at || session.created_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {selected ? (
          <ChatWindow
            title={selected.patient_name}
            subtitle={
              <>
                {selected.staff_id ? t('chat.assigned') : t('chat.unassigned')}
                {' · '}
                <PhoneLink phone={selected.patient_phone} />
              </>
            }
            presence={{ online: isOnline(selected.patient_id), label: presenceLabel(selected.patient_id) }}
            messages={messages}
            currentUserId={user.id}
            onSend={handleSend}
            onSendImage={handleSendImage}
            status={status}
            loading={loadingMessages}
          />
        ) : (
          <section className="card">
            <p className="empty">{t('chat.selectPatient')}</p>
          </section>
        )}
      </div>
    </>
  );
}
