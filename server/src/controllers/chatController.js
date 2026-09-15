const chatService = require('../services/chatService');
const chatHub = require('../ws/chatHub');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid session id');
  return id;
}

/** Patient: returns their chat session, creating it on first use. */
const openSession = asyncHandler(async (req, res) => {
  const session = await chatService.getOrCreateSessionForPatient(req.user.id);
  res.json({ session });
});

/** Staff: unified inbox of every session (FR 5.2). */
const listSessions = asyncHandler(async (req, res) => {
  res.json({ sessions: await chatService.listSessions() });
});

const listMessages = asyncHandler(async (req, res) => {
  const messages = await chatService.getMessages(parseId(req.params.id), req.user);
  res.json({ messages });
});

/** HTTP fallback for sending; the message is still pushed over WebSocket. */
const sendMessage = asyncHandler(async (req, res) => {
  const result = await chatService.sendMessage({
    sessionId: parseId(req.params.id),
    sender: req.user,
    content: req.body.content,
  });
  chatHub.publish(result);
  res.status(201).json({ message: result.message });
});

module.exports = { openSession, listSessions, listMessages, sendMessage };
