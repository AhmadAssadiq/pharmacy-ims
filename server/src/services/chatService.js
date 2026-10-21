/**
 * Chat between patients and staff (FR 5, FR 5.1, FR 5.2, UC-2).
 *
 * Every message is persisted in `chat_messages` and then pushed in real time
 * to the connected participants by the WebSocket hub (src/ws/chatHub.js).
 *
 * Images (GP2 addition) arrive over HTTP, never through the socket: the bytes
 * are sniffed, written to disk under a generated name, and the message that
 * points at them is published like any other. They are read back only through
 * getAttachment, which re-checks session access every time.
 */
const chatSessionModel = require('../models/chatSessionModel');
const chatMessageModel = require('../models/chatMessageModel');
const userModel = require('../models/userModel');
const { presence } = require('../ws/presence');
const {
  validateMessageContent,
  validateCaption,
  validateImageUpload,
  sanitizeDisplayName,
} = require('../validation/chatValidation');
const { sniffImage } = require('../utils/imageSniff');
const uploadStore = require('../utils/uploadStore');
const HttpError = require('../utils/httpError');
const { ROLES, ERROR_CODES } = require('../../../shared/constants.json');

/**
 * Patients have a single session with the pharmacy; it is created on first use.
 * The plain read covers the common case; create-or-get covers two first
 * requests arriving together, which the unique key on patient_id settles.
 */
async function getOrCreateSessionForPatient(patientId) {
  const existing = await chatSessionModel.findByPatientId(patientId);
  if (existing) return existing;
  return chatSessionModel.createOrGet(patientId);
}

/**
 * Staff unified inbox: every session with its latest message (FR 5.2), and
 * whether its patient is connected right now, so the first paint is right
 * before any presence frame arrives.
 */
async function listSessions() {
  const sessions = await chatSessionModel.findAllWithSummary();
  return sessions.map((s) => ({ ...s, online: presence.isOnline(s.patient_id) }));
}

/** Loads a session and verifies that `user` may take part in it. */
async function getAccessibleSession(sessionId, user) {
  const session = await chatSessionModel.findById(sessionId);
  if (!session) throw new HttpError(404, 'Chat session not found', undefined, { code: ERROR_CODES.CHAT_SESSION_NOT_FOUND });
  if (user.role !== ROLES.STAFF && session.patient_id !== user.id) {
    throw new HttpError(403, 'You do not have access to this chat session', undefined, {
      code: ERROR_CODES.CHAT_FORBIDDEN,
    });
  }
  return session;
}

async function getMessages(sessionId, user) {
  await getAccessibleSession(sessionId, user);
  return chatMessageModel.findBySessionId(sessionId);
}

/**
 * Persists a message. Returns { message, session } where `session` carries the
 * patient's name so the staff inbox can be updated without another request.
 */
async function sendMessage({ sessionId, sender, content }) {
  const check = validateMessageContent(content);
  if (!check.valid) throw new HttpError(400, check.error, undefined, { code: check.code, params: check.params });

  const session = await getAccessibleSession(sessionId, sender);
  return persist({ session, sender, content: check.value });
}

/** Stores a message in an accessible session, assigning staff on first reply. */
async function persist({ session, sender, content, attachment }) {
  // The first staff member who replies becomes the session's assigned staff.
  let current = session;
  if (sender.role === ROLES.STAFF && !current.staff_id) {
    current = await chatSessionModel.assignStaff(current.id, sender.id);
  }

  const message = await chatMessageModel.create({
    chatSessionId: current.id,
    senderId: sender.id,
    content,
    attachment,
  });

  const patient = await userModel.findById(current.patient_id);
  return {
    message,
    session: { ...current, patient_name: patient ? patient.name : 'Patient' },
  };
}

/**
 * An image message: `file` is multer's in-memory upload. Its declared type,
 * name and extension are ignored; only the sniffed bytes decide. The file is
 * written before the row, and removed again if the row cannot be stored.
 */
async function sendImage({ session, sender, file, caption }) {
  const captionCheck = validateCaption(caption);
  if (!captionCheck.valid) {
    throw new HttpError(400, captionCheck.error, undefined, { code: captionCheck.code, params: captionCheck.params });
  }

  const sniffed = sniffImage(file?.buffer);
  const check = validateImageUpload({ file, sniffed });
  if (!check.valid) {
    const status = check.code === ERROR_CODES.ATTACHMENT_TOO_LARGE ? 413 : check.code === ERROR_CODES.ATTACHMENT_TYPE ? 415 : 400;
    throw new HttpError(status, check.error, undefined, { code: check.code, params: check.params });
  }

  const key = uploadStore.newKey(sniffed.ext);
  await uploadStore.write(key, file.buffer);
  try {
    return await persist({
      session,
      sender,
      content: captionCheck.value,
      attachment: {
        path: key,
        mime: sniffed.mime,
        size: file.buffer.length,
        name: sanitizeDisplayName(file.originalname, sniffed.ext),
      },
    });
  } catch (err) {
    await uploadStore.remove(key).catch(() => {});
    throw err;
  }
}

/** A stored image by its key, after checking `user` may see that conversation. */
async function getAttachment(key, user) {
  const row = uploadStore.pathFor(key) ? await chatMessageModel.findByAttachmentKey(key) : null;
  const file = row && uploadStore.pathFor(row.attachment_path);
  if (!file) throw new HttpError(404, 'Attachment not found', undefined, { code: ERROR_CODES.ATTACHMENT_NOT_FOUND });
  await getAccessibleSession(row.chat_session_id, user);
  return { file, mime: row.attachment_mime, name: row.attachment_name };
}

module.exports = {
  getOrCreateSessionForPatient,
  listSessions,
  getAccessibleSession,
  getMessages,
  sendMessage,
  sendImage,
  getAttachment,
};
