const multer = require('multer');
const chatService = require('../services/chatService');
const chatHub = require('../ws/chatHub');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { contentDisposition } = require('../utils/contentDisposition');
const { CHAT_IMAGE_MAX_BYTES, ERROR_CODES } = require('../../../shared/constants.json');

// In memory, so the bytes are sniffed before anything touches the disk. The
// limits are enforced while the body streams in: express.json's 100kb limit
// does not apply to multipart, so this is the only size check on the way in.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CHAT_IMAGE_MAX_BYTES, files: 1, fields: 1, fieldSize: 16 * 1024, parts: 2 },
}).single('image');

function readUpload(req, res) {
  return new Promise((resolve, reject) => {
    upload(req, res, (err) => {
      if (!err) return resolve();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return reject(new HttpError(413, 'Image is too large', undefined, {
          code: ERROR_CODES.ATTACHMENT_TOO_LARGE,
          params: { count: CHAT_IMAGE_MAX_BYTES / (1024 * 1024) },
        }));
      }
      return reject(new HttpError(400, 'Send one image as the "image" field', undefined, { code: ERROR_CODES.ATTACHMENT_MISSING }));
    });
  });
}

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

/**
 * An image message. Session access is checked before the body is read, so a
 * user who may not post here never gets 5 MB buffered on their behalf.
 */
const sendImage = asyncHandler(async (req, res) => {
  const session = await chatService.getAccessibleSession(parseId(req.params.id), req.user);
  await readUpload(req, res);
  const result = await chatService.sendImage({ session, sender: req.user, file: req.file, caption: req.body?.caption });
  chatHub.publish(result);
  res.status(201).json({ message: result.message });
});

/**
 * Streams a stored image after re-checking access. The type is the sniffed
 * one stored with it; nosniff and a sandboxing CSP keep a browser from ever
 * treating it as anything else. The key is a random UUID, which is what makes
 * the long, private cache safe.
 */
const getAttachment = asyncHandler(async (req, res) => {
  const { file, mime, name } = await chatService.getAttachment(req.params.key, req.user);
  res.set({
    'Content-Type': mime,
    'Content-Disposition': contentDisposition(name),
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'private, max-age=31536000, immutable',
  });
  res.sendFile(file, { cacheControl: false, dotfiles: 'deny' });
});

module.exports = { openSession, listSessions, listMessages, sendMessage, sendImage, getAttachment };
