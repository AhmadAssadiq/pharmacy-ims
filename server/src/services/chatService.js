// Chat between patients and pharmacy staff (FR 5, FR 5.1, FR 5.2, UC-2).
//
// - Each patient has one chat session with the pharmacy, created the first time they open the chat.
// - Every message is saved in chat_messages. The live delivery to the other person happens
//   in socket/chatSocket.js.
// - A message can be text, an image, or an image with a caption (images are a GP2 addition).
//   Images are saved as files in the uploads folder under a random name, and can only be
//   downloaded through the logged-in route, which checks access every time.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import createError from 'http-errors';
import { fileTypeFromBuffer } from 'file-type';
import { db } from '../db.js';
import { config } from '../config.js';
import { ROLES, ERROR_CODES, CHAT_MESSAGE_MAX_LENGTH, CHAT_IMAGE_MAX_BYTES, CHAT_IMAGE_TYPES } from '../constants.js';

// ----------------------------------------------------------------------------
// Sessions
// ----------------------------------------------------------------------------

// Finds a chat session by id, or returns null.
async function findSessionById(id) {
  const [rows] = await db.query('SELECT id, patient_id, staff_id, created_at FROM chat_sessions WHERE id = ?', [id]);
  return rows[0] || null;
}

// A patient's chat session, created the first time it is needed.
export async function getOrCreateSession(patientId) {
  // patient_id is unique, so if two "open chat" requests arrive at once, the second INSERT
  // does nothing (ON DUPLICATE KEY ...) and both read back the same row.
  await db.query(
    'INSERT INTO chat_sessions (patient_id) VALUES (?) ON DUPLICATE KEY UPDATE patient_id = patient_id',
    [patientId]
  );
  const [rows] = await db.query(
    'SELECT id, patient_id, staff_id, created_at FROM chat_sessions WHERE patient_id = ?',
    [patientId]
  );
  return rows[0];
}

// The staff inbox (FR 5.2): every session with the patient's name, the assigned staff
// member and the latest message, most recent conversation first.
export async function getAllSessions() {
  const [rows] = await db.query(
    `SELECT s.id, s.patient_id, p.name AS patient_name, p.phone AS patient_phone,
            s.staff_id, st.name AS staff_name, s.created_at,
            m.content AS last_message,
            m.attachment_mime IS NOT NULL AS last_message_has_image,
            m.timestamp AS last_message_at
     FROM chat_sessions s
     JOIN users p ON p.id = s.patient_id
     LEFT JOIN users st ON st.id = s.staff_id
     LEFT JOIN chat_messages m
       ON m.id = (SELECT id FROM chat_messages
                  WHERE chat_session_id = s.id ORDER BY timestamp DESC, id DESC LIMIT 1)
     ORDER BY COALESCE(m.timestamp, s.created_at) DESC`
  );
  return rows;
}

// Loads a session and checks that `user` may take part in it:
// staff may see every session, a patient only their own. Throws 404 or 403 otherwise.
export async function getAccessibleSession(sessionId, user) {
  const session = await findSessionById(sessionId);
  if (!session) {
    throw createError(404, 'Chat session not found', { code: ERROR_CODES.CHAT_SESSION_NOT_FOUND });
  }
  const isStaff = user.role === ROLES.STAFF;
  const isOwnSession = session.patient_id === user.id;
  if (!isStaff && !isOwnSession) {
    throw createError(403, 'You do not have access to this chat session', { code: ERROR_CODES.CHAT_FORBIDDEN });
  }
  return session;
}

// ----------------------------------------------------------------------------
// Messages
// ----------------------------------------------------------------------------

// The SELECT used for every message read, with the sender's name and role
const SELECT_MESSAGES = `
  SELECT m.id, m.chat_session_id, m.sender_id, u.name AS sender_name, u.role AS sender_role,
         m.content, m.attachment_path, m.attachment_mime, m.attachment_size, m.attachment_name, m.timestamp
  FROM chat_messages m JOIN users u ON u.id = m.sender_id`;

// Turns a database row into the message the browser receives. The four attachment
// columns become one `attachment` object: { id, mime, size, name }, or null for text.
function toMessage(row) {
  let attachment = null;
  if (row.attachment_path) {
    attachment = {
      id: row.attachment_path, // the stored file's random name; the browser downloads by it
      mime: row.attachment_mime,
      size: Number(row.attachment_size),
      name: row.attachment_name,
    };
  }
  return {
    id: row.id,
    chat_session_id: row.chat_session_id,
    sender_id: row.sender_id,
    sender_name: row.sender_name,
    sender_role: row.sender_role,
    content: row.content,
    timestamp: row.timestamp,
    attachment,
  };
}

// Every message of a session, oldest first (after checking access).
export async function getMessages(sessionId, user) {
  await getAccessibleSession(sessionId, user);
  const [rows] = await db.query(
    `${SELECT_MESSAGES} WHERE m.chat_session_id = ? ORDER BY m.timestamp ASC, m.id ASC`,
    [sessionId]
  );
  return rows.map(toMessage);
}

// Checks a text message: not empty, not longer than 2000 characters. Returns the trimmed text.
function checkMessageText(text, { allowEmpty }) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed && !allowEmpty) {
    throw createError(400, 'Message cannot be empty', { code: ERROR_CODES.MESSAGE_EMPTY });
  }
  if (trimmed.length > CHAT_MESSAGE_MAX_LENGTH) {
    throw createError(400, `Message must be at most ${CHAT_MESSAGE_MAX_LENGTH} characters`, {
      code: ERROR_CODES.MESSAGE_TOO_LONG,
      params: { count: CHAT_MESSAGE_MAX_LENGTH },
    });
  }
  return trimmed;
}

// Saves a message in a session the sender may use, and returns { message, session }.
// `session` includes the patient's name and phone, so the staff inbox can update itself
// without asking the server again. `image` is optional: { path, mime, size, name }.
async function saveMessage(session, sender, text, image) {
  // The first staff member who replies becomes the session's assigned staff member
  let currentSession = session;
  if (sender.role === ROLES.STAFF && !session.staff_id) {
    await db.query('UPDATE chat_sessions SET staff_id = ? WHERE id = ? AND staff_id IS NULL', [sender.id, session.id]);
    currentSession = await findSessionById(session.id);
  }

  const [result] = await db.query(
    `INSERT INTO chat_messages
       (chat_session_id, sender_id, content, attachment_path, attachment_mime, attachment_size, attachment_name)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      currentSession.id,
      sender.id,
      text,
      image ? image.path : null,
      image ? image.mime : null,
      image ? image.size : null,
      image ? image.name : null,
    ]
  );
  const [rows] = await db.query(`${SELECT_MESSAGES} WHERE m.id = ?`, [result.insertId]);

  // Add the patient's name and phone for the staff inbox
  const [patients] = await db.query('SELECT name, phone FROM users WHERE id = ?', [currentSession.patient_id]);
  const patient = patients[0];
  return {
    message: toMessage(rows[0]),
    session: {
      ...currentSession,
      patient_name: patient ? patient.name : 'Patient',
      patient_phone: patient ? patient.phone : null,
    },
  };
}

// Sends a text message. Used by the HTTP route and by the live chat socket.
// Returns { message, session } (see saveMessage).
export async function sendTextMessage(sessionId, sender, text) {
  const cleanText = checkMessageText(text, { allowEmpty: false });
  const session = await getAccessibleSession(sessionId, sender);
  return saveMessage(session, sender, cleanText, null);
}

// ----------------------------------------------------------------------------
// Images (GP2 addition)
// ----------------------------------------------------------------------------

// Stored file names look like "<random uuid>.png". Anything else is refused before it is
// joined to the folder path, so a tampered name can never point outside the uploads folder.
const STORED_NAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp)$/;

// Full path of a stored image, or null when the name is not one we create.
function storedImagePath(storedName) {
  if (!STORED_NAME_PATTERN.test(String(storedName))) {
    return null;
  }
  return path.join(config.uploadsDir, storedName);
}

// Creates the uploads folder if it does not exist yet (called when the server starts).
export function ensureUploadsFolder() {
  fs.mkdirSync(config.uploadsDir, { recursive: true });
}

// Deletes a stored image file. A file that is already gone is not an error.
export async function deleteStoredImage(storedName) {
  const filePath = storedImagePath(storedName);
  if (filePath) {
    await fs.promises.rm(filePath, { force: true });
  }
}

// A safe name to show for the downloaded file: the original name without folders or
// risky characters, at most 100 characters, ending with the real file type's extension
// (so "photo.svg" that is really a PNG becomes "photo.png"). It is never used as a file path.
export function makeDisplayName(originalName, extension) {
  let name = String(originalName ?? '');
  name = name.split(/[\\/]/).pop(); // drop any folder part
  name = name.normalize('NFC');
  name = name.replace(/\.[^.]*$/, ''); // drop the extension
  name = name.replace(/[\u0000-\u001f\u007f"<>:|?*%;]/g, ''); // drop control and risky characters
  name = name.replace(/\s+/g, ' ').trim();
  name = name.slice(0, 100);
  if (!name) {
    name = 'image';
  }
  return `${name}.${extension}`;
}

// Sends an image message. `file` is the upload from multer: { buffer, originalname }.
// The file type is decided by its actual bytes (file-type library), never by the name or
// by what the browser claims - so a script renamed to .png is refused.
// Returns { message, session } (see saveMessage).
export async function sendImageMessage(session, sender, file, caption) {
  // 1. The caption is optional, but has the same length limit as a message
  const cleanCaption = checkMessageText(caption, { allowEmpty: true });

  // 2. There must be a file
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw createError(400, 'Choose an image to send', { code: ERROR_CODES.ATTACHMENT_MISSING });
  }
  if (file.buffer.length > CHAT_IMAGE_MAX_BYTES) {
    throw createError(413, 'Image is too large', {
      code: ERROR_CODES.ATTACHMENT_TOO_LARGE,
      params: { count: CHAT_IMAGE_MAX_BYTES / (1024 * 1024) },
    });
  }

  // 3. It must really be a PNG, JPEG, WebP or GIF (SVG and text files are never accepted)
  const detectedType = await fileTypeFromBuffer(file.buffer);
  if (!detectedType || !CHAT_IMAGE_TYPES.includes(detectedType.mime)) {
    throw createError(415, 'Only image files can be sent', { code: ERROR_CODES.ATTACHMENT_TYPE });
  }

  // 4. Save it under a new random name ('wx' = never overwrite an existing file)
  const storedName = `${crypto.randomUUID()}.${detectedType.ext}`;
  ensureUploadsFolder();
  await fs.promises.writeFile(storedImagePath(storedName), file.buffer, { flag: 'wx' });

  // 5. Save the message. If that fails, remove the file again so no orphan is left behind.
  try {
    return await saveMessage(session, sender, cleanCaption, {
      path: storedName,
      mime: detectedType.mime,
      size: file.buffer.length,
      name: makeDisplayName(file.originalname, detectedType.ext),
    });
  } catch (error) {
    await deleteStoredImage(storedName).catch(() => {});
    throw error;
  }
}

// Finds a stored image for download, after checking `user` may see that conversation.
// Returns { filePath, mime, name }, or throws 404 / 403.
export async function getImageForDownload(storedName, user) {
  const notFound = createError(404, 'Attachment not found', { code: ERROR_CODES.ATTACHMENT_NOT_FOUND });

  // The name must be one we create, and a message must point to it
  if (!storedImagePath(storedName)) {
    throw notFound;
  }
  const [rows] = await db.query(
    'SELECT chat_session_id, attachment_path, attachment_mime, attachment_name FROM chat_messages WHERE attachment_path = ?',
    [storedName]
  );
  const row = rows[0];
  if (!row) {
    throw notFound;
  }

  // Same access rule as the conversation itself
  await getAccessibleSession(row.chat_session_id, user);
  return { filePath: storedImagePath(row.attachment_path), mime: row.attachment_mime, name: row.attachment_name };
}
