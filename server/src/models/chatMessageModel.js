/**
 * Data access for the `chat_messages` table.
 *
 * A message with an image carries `attachment: { id, mime, size, name }`,
 * where `id` is the stored file's random key. It is the handle the client
 * downloads by; being unguessable is what lets the download be cached, and
 * every download still re-checks session access.
 */
const pool = require('../config/db');

const SELECT = `SELECT m.id, m.chat_session_id, m.sender_id, u.name AS sender_name, u.role AS sender_role,
                       m.content, m.attachment_path, m.attachment_mime, m.attachment_size, m.attachment_name,
                       m.timestamp
                FROM chat_messages m JOIN users u ON u.id = m.sender_id`;

function toMessage(row) {
  if (!row) return null;
  const { attachment_path: id, attachment_mime: mime, attachment_size: size, attachment_name: name, ...message } = row;
  return { ...message, attachment: id ? { id, mime, size: Number(size), name } : null };
}

async function findById(id) {
  const [rows] = await pool.execute(`${SELECT} WHERE m.id = ?`, [id]);
  return toMessage(rows[0]);
}

async function findBySessionId(sessionId) {
  const [rows] = await pool.execute(
    `${SELECT} WHERE m.chat_session_id = ? ORDER BY m.timestamp ASC, m.id ASC`,
    [sessionId]
  );
  return rows.map(toMessage);
}

/** `attachment` is { path, mime, size, name } or omitted for a text message. */
async function create({ chatSessionId, senderId, content, attachment = null }) {
  const [result] = await pool.execute(
    `INSERT INTO chat_messages
       (chat_session_id, sender_id, content, attachment_path, attachment_mime, attachment_size, attachment_name)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      chatSessionId,
      senderId,
      content,
      attachment?.path ?? null,
      attachment?.mime ?? null,
      attachment?.size ?? null,
      attachment?.name ?? null,
    ]
  );
  return findById(result.insertId);
}

/** The message holding a stored file, with its session, so access can be re-checked. */
async function findByAttachmentKey(key) {
  const [rows] = await pool.execute(
    `SELECT m.id, m.chat_session_id, m.attachment_path, m.attachment_mime, m.attachment_name
     FROM chat_messages m WHERE m.attachment_path = ?`,
    [key]
  );
  return rows[0] || null;
}

/** Every stored file key in a patient's conversation (used when the patient deletes their account). */
async function findAttachmentPathsForPatient(patientId) {
  const [rows] = await pool.execute(
    `SELECT m.attachment_path FROM chat_messages m
     JOIN chat_sessions s ON s.id = m.chat_session_id
     WHERE s.patient_id = ? AND m.attachment_path IS NOT NULL`,
    [patientId]
  );
  return rows.map((r) => r.attachment_path);
}

module.exports = { findById, findBySessionId, create, findByAttachmentKey, findAttachmentPathsForPatient };
