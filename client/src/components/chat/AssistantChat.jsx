// The chat with Rafiq, the AI assistant (GP2 addition). Patients and staff each have their
// own private conversation; it is shown in the "Rafiq" tab of their chat page.
//
// It reuses ChatWindow (the same chat box as the pharmacist chat), without the image and
// voice buttons. Before the first use it shows a short notice: Rafiq is an AI, it gives
// general information only, and questions are sent to an outside AI service.
import { useEffect, useState } from 'react';
import { askAssistant, clearAssistantMessages, fetchAssistantMessages } from '../../api/assistant';
import ChatWindow from './ChatWindow';
import ConfirmDialog from '../ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/useI18n';
import { ROLES } from '../../utils/routes';

// The id ChatWindow sees as "the other person" for Rafiq's messages
const RAFIQ_ID = 0;

// Whether this user has already read the notice is remembered in the browser
function noticeKey(userId) {
  return `pims_rafiq_notice_${userId}`;
}

export default function AssistantChat() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accepted, setAccepted] = useState(() => localStorage.getItem(noticeKey(user.id)) === 'yes');
  const [clearing, setClearing] = useState(false); // the "clear conversation?" dialog is open
  const [busy, setBusy] = useState(false);

  // On load: the conversation so far
  useEffect(() => {
    fetchAssistantMessages()
      .then((data) => setMessages(data.messages))
      .catch((loadError) => setError(loadError))
      .finally(() => setLoading(false));
  }, []);

  // "I understand" on the notice
  function acceptNotice() {
    localStorage.setItem(noticeKey(user.id), 'yes');
    setAccepted(true);
  }

  // Sends a question and adds the question and Rafiq's answer to the conversation.
  // (ChatWindow shows "Sending..." while this waits, and the error if it fails.)
  async function handleSend(text) {
    const result = await askAssistant(text);
    setMessages((current) => [...current, result.question, result.answer]);
  }

  async function confirmClear() {
    setBusy(true);
    try {
      await clearAssistantMessages();
      setMessages([]);
      setError(null);
    } catch (clearError) {
      setError(clearError);
    } finally {
      setBusy(false);
      setClearing(false);
    }
  }

  // Before the first use: the notice
  if (!accepted) {
    return (
      <section className="card" aria-labelledby="rafiq-notice">
        <h2 id="rafiq-notice">{t('assistant.noticeTitle')}</h2>
        <ul className="danger-list">
          <li>{t('assistant.noticeAi')}</li>
          <li>{t('assistant.noticeGeneral')}</li>
          <li>{t('assistant.noticePrivacy')}</li>
        </ul>
        <div className="form-actions">
          <button type="button" className="btn btn--primary" onClick={acceptNotice}>
            {t('assistant.noticeAccept')}
          </button>
        </div>
      </section>
    );
  }

  // Turn the saved messages into the shape ChatWindow shows
  const chatMessages = messages.map((message) => ({
    id: message.id,
    sender_id: message.role === 'user' ? user.id : RAFIQ_ID,
    sender_name: t('assistant.name'),
    content: message.content,
    timestamp: message.created_at,
    attachment: null,
  }));

  return (
    <>
      <ChatWindow
        title={t('assistant.name')}
        subtitle={t('assistant.subtitle')}
        messages={chatMessages}
        currentUserId={user.id}
        onSend={handleSend}
        status="online"
        loading={loading}
        error={error}
        notice={
          <p className="chat-window__connection">
            {t(user.role === ROLES.STAFF ? 'assistant.reminderStaff' : 'assistant.reminder')}
          </p>
        }
      />
      {messages.length > 0 && (
        <div className="form-actions">
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setClearing(true)}>
            {t('assistant.clear')}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={clearing}
        title={t('assistant.clearTitle')}
        lead={t('assistant.clearLead')}
        confirmLabel={t('assistant.clear')}
        busy={busy}
        onCancel={() => setClearing(false)}
        onConfirm={confirmClear}
      />
    </>
  );
}
