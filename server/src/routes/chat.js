// Routes under /api/chat: chat sessions, message history, and image messages (FR 5).
// Live delivery of new messages happens over Socket.IO (socket/chatSocket.js); these HTTP
// routes save messages too and then pass them to the socket so they still arrive live.
import express from 'express';
import multer from 'multer';
import createError from 'http-errors';
import contentDisposition from 'content-disposition';
import { ROLES, ERROR_CODES, CHAT_IMAGE_MAX_BYTES } from '../constants.js';
import { requireLogin, requireRole } from '../middleware/auth.js';
import { parseId } from '../utils/parseId.js';
import * as chatService from '../services/chatService.js';
import { publishMessage, getOnlinePatientIds } from '../socket/chatSocket.js';

const router = express.Router();
router.use(requireLogin);

// multer reads an uploaded image (the "image" field of a multipart form) into memory,
// so its bytes can be checked before anything is written to disk.
// The limits are checked while the upload streams in: at most one 5 MB file.
const uploadOneImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CHAT_IMAGE_MAX_BYTES, files: 1, fields: 1, fieldSize: 16 * 1024, parts: 2 },
  defParamCharset: 'utf8', // read file names as UTF-8, so Arabic names are kept correctly
}).single('image');

// Middleware: runs multer and turns its errors into the app's error format.
function receiveImage(req, res, next) {
  uploadOneImage(req, res, (error) => {
    if (!error) {
      return next();
    }
    if (error.code === 'LIMIT_FILE_SIZE') {
      return next(
        createError(413, 'Image is too large', {
          code: ERROR_CODES.ATTACHMENT_TOO_LARGE,
          params: { count: CHAT_IMAGE_MAX_BYTES / (1024 * 1024) },
        })
      );
    }
    return next(createError(400, 'Send one image as the "image" field', { code: ERROR_CODES.ATTACHMENT_MISSING }));
  });
}

// Middleware: loads the session in the URL and checks the user may use it.
// It runs BEFORE receiveImage, so nobody can make the server read 5 MB for a chat they cannot use.
async function loadAccessibleSession(req, res, next) {
  req.chatSession = await chatService.getAccessibleSession(parseId(req.params.id, 'session'), req.user);
  next();
}

// POST /api/chat/sessions - a patient opens their chat (it is created the first time)
router.post('/sessions', requireRole(ROLES.PATIENT), async (req, res) => {
  const session = await chatService.getOrCreateSession(req.user.id);
  res.json({ session });
});

// GET /api/chat/sessions - staff: the inbox with every conversation (FR 5.2),
// including whether each patient is online right now
router.get('/sessions', requireRole(ROLES.STAFF), async (req, res) => {
  const sessions = await chatService.getAllSessions();
  const onlinePatientIds = await getOnlinePatientIds();
  const sessionsWithOnline = sessions.map((session) => ({
    ...session,
    online: onlinePatientIds.includes(session.patient_id),
  }));
  res.json({ sessions: sessionsWithOnline });
});

// GET /api/chat/sessions/4/messages - the messages of a conversation
router.get('/sessions/:id/messages', async (req, res) => {
  const messages = await chatService.getMessages(parseId(req.params.id, 'session'), req.user);
  res.json({ messages });
});

// POST /api/chat/sessions/4/messages - send a text message { content }
// (the app normally sends over the socket; this is the fallback when the socket is down)
router.post('/sessions/:id/messages', async (req, res) => {
  const result = await chatService.sendTextMessage(parseId(req.params.id, 'session'), req.user, req.body?.content);
  publishMessage(result);
  res.status(201).json({ message: result.message });
});

// POST /api/chat/sessions/4/attachments - send an image (multipart form: image, caption)
router.post('/sessions/:id/attachments', loadAccessibleSession, receiveImage, async (req, res) => {
  const result = await chatService.sendImageMessage(req.chatSession, req.user, req.file, req.body?.caption);
  publishMessage(result);
  res.status(201).json({ message: result.message });
});

// GET /api/chat/attachments/<stored name> - download an image (access is checked every time).
// The headers make sure the browser only ever treats it as an image, and let it cache it.
router.get('/attachments/:key', async (req, res, next) => {
  const image = await chatService.getImageForDownload(req.params.key, req.user);
  res.set({
    'Content-Type': image.mime,
    'Content-Disposition': contentDisposition(image.name, { type: 'inline' }),
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'private, max-age=31536000, immutable',
  });
  // If the file is missing from the disk, answer a plain 404 (never the file's full path)
  res.sendFile(image.filePath, { cacheControl: false, dotfiles: 'deny' }, (error) => {
    if (error && !res.headersSent) {
      next(createError(404, 'Attachment not found', { code: ERROR_CODES.ATTACHMENT_NOT_FOUND }));
    }
  });
});

export default router;
