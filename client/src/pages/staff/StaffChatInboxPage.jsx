import { useCallback, useEffect, useState } from 'react';
import { fetchMessages, fetchSessions, postImage, postMessage } from '../../api/chat';
import ChatWindow, { PresenceMark } from '../../components/chat/ChatWindow';
import PhoneLink from '../../components/PhoneLink';
import { useAuth } from '../../context/AuthContext';
import useChatSocket from '../../hooks/useChatSocket';
import { useI18n } from '../../i18n/I18nContext';

/**
 * Staff unified inbox (FR 5.2): every patient session in one list, with the
 * selected conversation on the right. Incoming messages update both without
 * a page refresh.
 */
export default function StaffChatInboxPage() {
  const { user } = useAuth();
  const { t, te, formatDateTime } = useI18n();
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState(null);
  // patientId -> online. Seeded by the sessions list, then kept current by the hub.
  const [online, setOnline] = useState({});

  useEffect(() => {
    fetchSessions()
      .then((data) => {
        setSessions(data.sessions);
        setOnline((prev) => ({ ...Object.fromEntries(data.sessions.map((s) => [s.patient_id, s.online])), ...prev }));
      })
      .catch((err) => setError(err))
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
        if (!cancelled) setError(err);
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
      if (frame.type === 'ready') {
        // The snapshot is the whole truth at this moment: everyone not in it is offline.
        const ids = new Set(frame.presence?.patients ?? []);
        setOnline((prev) => {
          const next = Object.fromEntries(Object.keys(prev).map((id) => [id, false]));
          for (const id of ids) next[id] = true;
          return next;
        });
        return;
      }
      if (frame.type === 'presence' && frame.scope === 'patient') {
        setOnline((prev) => ({ ...prev, [frame.userId]: frame.online }));
        return;
      }
      if (frame.type !== 'message') return;
      const { message, session } = frame;

      // Update the inbox summary (and add the session if it is new).
      setSessions((prev) => {
        const rest = prev.filter((s) => s.id !== session.id);
        const existing = prev.find((s) => s.id === session.id);
        const updated = {
          ...(existing || { id: session.id, patient_id: session.patient_id, created_at: session.created_at }),
          patient_name: session.patient_name,
          patient_phone: session.patient_phone ?? existing?.patient_phone ?? null,
          staff_id: session.staff_id,
          last_message: message.content,
          last_message_has_image: Boolean(message.attachment),
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

  const handleSendImage = async (file, caption) => {
    const { message } = await postImage(selectedId, file, caption);
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
  };

  const selected = sessions.find((s) => s.id === selectedId);
  const isOnline = (patientId) => status === 'online' && Boolean(online[patientId]);

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
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`list__item list__item--button ${s.id === selectedId ? 'is-active' : ''}`}
                  onClick={() => setSelectedId(s.id)}
                >
                  <span>
                    <strong><bdi>{s.patient_name}</bdi></strong>{' '}
                    <PresenceMark
                      online={isOnline(s.patient_id)}
                      label={isOnline(s.patient_id) ? t('presence.patientOnline') : t('presence.patientOffline')}
                    />
                    <br />
                    <span className="muted" style={{ fontSize: '0.85rem' }}>
                      {s.last_message ? (
                        <bdi>{s.last_message.slice(0, 40)}</bdi>
                      ) : s.last_message_has_image ? (
                        t('chat.imagePreview')
                      ) : (
                        t('chat.noMessagesYet')
                      )}
                    </span>
                  </span>
                  <span className="muted" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                    {formatDateTime(s.last_message_at || s.created_at)}
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
            presence={{
              online: isOnline(selected.patient_id),
              label: isOnline(selected.patient_id) ? t('presence.patientOnline') : t('presence.patientOffline'),
            }}
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
