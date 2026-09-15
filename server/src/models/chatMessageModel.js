/**
 * Data access for the `chat_messages` table.
 */
const pool = require('../config/db');

const SELECT = `SELECT m.id, m.chat_session_id, m.sender_id, u.name AS sender_name, u.role AS sender_role,
                       m.content, m.timestamp
                FROM chat_messages m JOIN users u ON u.id = m.sender_id`;

async function findById(id) {
  const [rows] = await pool.execute(`${SELECT} WHERE m.id = ?`, [id]);
  return rows[0] || null;
}

async function findBySessionId(sessionId) {
  const [rows] = await pool.execute(
    `${SELECT} WHERE m.chat_session_id = ? ORDER BY m.timestamp ASC, m.id ASC`,
    [sessionId]
  );
  return rows;
}

async function create({ chatSessionId, senderId, content }) {
  const [result] = await pool.execute(
    'INSERT INTO chat_messages (chat_session_id, sender_id, content) VALUES (?, ?, ?)',
    [chatSessionId, senderId, content]
  );
  return findById(result.insertId);
}

module.exports = { findById, findBySessionId, create };
