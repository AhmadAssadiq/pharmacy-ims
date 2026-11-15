// The patient's chat with the pharmacy (FR 5, UC-2).
// The patient has one conversation; it is opened (or created) when the page loads.
// New messages arrive live over the chat connection (hooks/useChatSocket.js).
// A second tab holds the chat with Rafiq, the AI assistant (GP2 addition).
import { useEffect, useState } from 'react';
import { fetchMessages, openMySession, postImage, postMessage, postVoice } from '../../api/chat';
import AssistantChat from '../../components/chat/AssistantChat';
import ChatTabs from '../../components/chat/ChatTabs';
import ChatWindow from '../../components/chat/ChatWindow';
import { useAuth } from '../../context/AuthContext';
import useChatSocket, { addMessageIfNew } from '../../hooks/useChatSocket';
import { useI18n } from '../../i18n/useI18n';

export default function PatientChatPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Whether anyone at the pharmacy is online: null until the server tells us
  const [pharmacyOnline, setPharmacyOnline] = useState(null);
  // Which tab is open: 'pharmacist' (the real chat) or 'rafiq' (the AI assistant)
  const [tab, setTab] = useState('pharmacist');

  // On load: open the conversation and load its messages
  useEffect(() => {
    async function loadChat() {
      try {
        const opened = await openMySession();
        const history = await fetchMessages(opened.session.id);
        setSession(opened.session);
        setMessages(history.messages);
      } catch (loadError) {
        setError(loadError);
      } finally {
        setLoading(false);
      }
    }
    loadChat();
  }, []);

  // Everything the chat server sends us
  function handleEvent(event) {
    if (event.type === 'ready') {
      setPharmacyOnline(Boolean(event.presence.pharmacyOnline));
    } else if (event.type === 'presence' && event.scope === 'pharmacy') {
      setPharmacyOnline(event.online);
    } else if (event.type === 'message' && session && event.message.chat_session_id === session.id) {
      setMessages((current) => addMessageIfNew(current, event.message));
    }
  }

  const { status, sendMessage } = useChatSocket(handleEvent);

  // Send over the live connection; if it is down, send through the normal API instead
  async function handleSend(text) {
    let message;
    if (status === 'online') {
      message = await sendMessage(session.id, text);
    } else {
      message = (await postMessage(session.id, text)).message;
    }
    setMessages((current) => addMessageIfNew(current, message));
  }

  // Images always go through the normal API (they are too big for the chat connection)
  async function handleSendImage(file, caption) {
    const result = await postImage(session.id, file, caption);
    setMessages((current) => addMessageIfNew(current, result.message));
  }

  // Voice messages also go through the normal API. `recording` is the recorded audio.
  async function handleSendVoice(recording) {
    const result = await postVoice(session.id, recording);
    setMessages((current) => addMessageIfNew(current, result.message));
  }

  // While our own connection is down we do not know if the pharmacy is online
  const isKnown = status === 'online' && pharmacyOnline !== null;
  let presenceLabel = t('presence.unknown');
  if (isKnown) {
    presenceLabel = pharmacyOnline ? t('presence.pharmacyOnline') : t('presence.pharmacyOffline');
  }

  return (
    <>
      <div className="page-header">
        <h1>{t('chat.patientTitle')}</h1>
      </div>

      {/* Two tabs: the real pharmacist, or Rafiq the AI assistant */}
      <ChatTabs
        tabs={[
          { key: 'pharmacist', label: t('assistant.tabPharmacist') },
          { key: 'rafiq', label: t('assistant.name') },
        ]}
        current={tab}
        onChange={setTab}
      />

      {/* The pharmacist chat stays on the page while the Rafiq tab is open (only hidden),
          so its messages and live connection are kept */}
      <div hidden={tab !== 'pharmacist'}>
        <ChatWindow
          title={t('chat.staffWindowTitle')}
          subtitle={session && session.staff_id ? t('chat.pharmacistJoined') : t('chat.waitingForPharmacist')}
          presence={{ online: isKnown && pharmacyOnline, label: presenceLabel }}
          messages={messages}
          currentUserId={user.id}
          onSend={handleSend}
          onSendImage={handleSendImage}
          onSendVoice={handleSendVoice}
          status={status}
          loading={loading}
          error={error}
        />
      </div>
      {tab === 'rafiq' && <AssistantChat />}
    </>
  );
}
