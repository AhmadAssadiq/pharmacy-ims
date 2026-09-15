/**
 * Chat between patients and staff (FR 5, FR 5.1, FR 5.2, UC-2).
 *
 * Every message is persisted in `chat_messages` and then pushed in real time
 * to the connected participants by the WebSocket hub (src/ws/chatHub.js).
 */
const chatSessionModel = require('../models/chatSessionModel');
const chatMessageModel = require('../models/chatMessageModel');
const userModel = require('../models/userModel');
const { validateMessageContent } = require('../validation/chatValidation');
const HttpError = require('../utils/httpError');
const { ROLES } = require('../../../shared/constants.json');

/** Patients have a single session with the pharmacy; it is created on first use. */
async function getOrCreateSessionForPatient(patientId) {
  const existing = await chatSessionModel.findByPatientId(patientId);
  if (existing) return existing;
  return chatSessionModel.create(patientId);
}

/** Staff unified inbox: every session with its latest message (FR 5.2). */
async function listSessions() {
  return chatSessionModel.findAllWithSummary();
}

/** Loads a session and verifies that `user` may take part in it. */
async function getAccessibleSession(sessionId, user) {
  const session = await chatSessionModel.findById(sessionId);
  if (!session) throw new HttpError(404, 'Chat session not found');
  if (user.role !== ROLES.STAFF && session.patient_id !== user.id) {
    throw new HttpError(403, 'You do not have access to this chat session');
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
  if (!check.valid) throw new HttpError(400, check.error);

  let session = await getAccessibleSession(sessionId, sender);

  // The first staff member who replies becomes the session's assigned staff.
  if (sender.role === ROLES.STAFF && !session.staff_id) {
    session = await chatSessionModel.assignStaff(session.id, sender.id);
  }

  const message = await chatMessageModel.create({
    chatSessionId: session.id,
    senderId: sender.id,
    content: check.value,
  });

  const patient = await userModel.findById(session.patient_id);
  return {
    message,
    session: { ...session, patient_name: patient ? patient.name : 'Patient' },
  };
}

module.exports = { getOrCreateSessionForPatient, listSessions, getMessages, sendMessage };
