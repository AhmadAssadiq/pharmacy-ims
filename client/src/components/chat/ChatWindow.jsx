// The chat box used by both the patient chat page and the staff inbox: the list of messages
// and the box to type in. It can also attach one image (GP2 addition); the image is checked
// here for type and size first, but the server makes the final decision.
// It can also record a voice message (GP2 addition): hold the microphone button to record,
// let go to stop, then listen to it and choose Send or Discard.
// Message bubbles use flex start/end, so mine and theirs swap sides in Arabic.
import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../../i18n/useI18n';
import useVoiceRecorder from '../../hooks/useVoiceRecorder';
import ChatAudio from './ChatAudio';
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

export default function ChatWindow({
  title,
  subtitle,
  presence,
  messages,
  currentUserId,
  onSend,
  onSendImage,
  onSendVoice,
  status,
  loading,
  error,
  notice,
}) {
  const { t, te, formatDateTime } = useI18n();
  const voice = useVoiceRecorder();
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

  // ---- Voice message ----

  // Mouse or finger pressed on the microphone button: start recording. "Capturing" the
  // pointer means we still hear about the release if it happens outside the button.
  const handleMicDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setSendError(null);
    voice.start();
  };

  // Released: stop recording (the recording then appears in the preview strip)
  const handleMicUp = () => voice.stop();

  // Keyboard: Space or Enter starts recording, pressing it again stops
  const handleMicKey = (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      if (voice.isRecording) voice.stop();
      else voice.start();
    }
  };

  // "Send" on the preview strip
  const handleSendVoice = async () => {
    setSending(true);
    setSendError(null);
    try {
      await onSendVoice(voice.recording.blob);
      voice.discard();
    } catch (err) {
      setSendError(te(err));
    } finally {
      setSending(false);
    }
  };

  // 75 seconds -> "1:15"
  const formatSeconds = (total) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;

  const canRecord = Boolean(onSendVoice) && voice.isSupported;

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
              {/* A voice message is played; any other attachment is an image */}
              {m.attachment && m.attachment.mime.startsWith('audio/') && (
                <ChatAudio
                  attachment={m.attachment}
                  label={mine ? t('chat.voiceLabelMine') : t('chat.voiceLabel', { name: m.sender_name })}
                />
              )}
              {m.attachment && !m.attachment.mime.startsWith('audio/') && (
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

      {notice}
      {sendError && <div className="alert alert--error" role="alert">{sendError}</div>}

      {/* Voice message: what is happening, then the recording to listen to before sending */}
      {voice.problem && (
        <p className="chat-window__connection" role="status">
          {t(voice.problem === 'denied' ? 'chat.micDenied' : 'chat.voiceTooShort')}
        </p>
      )}
      {voice.isRecording && (
        <div className="chat-composer__preview chat-voice" role="status">
          <span className="chat-voice__dot" aria-hidden="true" />
          <span>{t('chat.recording', { time: formatSeconds(voice.seconds) })}</span>
          <span className="muted">{t('chat.recordingHint')}</span>
        </div>
      )}
      {voice.recording && (
        <div className="chat-composer__preview chat-voice">
          <audio controls src={voice.recording.url} aria-label={t('chat.voiceReady')} />
          <button type="button" className="btn btn--sm btn--primary" onClick={handleSendVoice} disabled={sending}>
            {sending ? t('chat.sending') : t('chat.sendVoice')}
          </button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={voice.discard} disabled={sending}>
            {t('chat.discardVoice')}
          </button>
        </div>
      )}

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
        {canRecord && (
          <button
            type="button"
            className={`btn btn--icon chat-window__mic ${voice.isRecording ? 'is-recording' : ''}`}
            onPointerDown={handleMicDown}
            onPointerUp={handleMicUp}
            onPointerCancel={handleMicUp}
            onKeyDown={handleMicKey}
            onContextMenu={(e) => e.preventDefault()}
            title={t('chat.recordVoice')}
            aria-pressed={voice.isRecording}
            disabled={sending || Boolean(voice.recording)}
          >
            {/* A microphone */}
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <rect x="5.75" y="1.75" width="4.5" height="8" rx="2.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.25M5.5 14.25h5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="sr-only">{t('chat.recordVoice')}</span>
          </button>
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
