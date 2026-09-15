/**
 * Data access for the `chat_sessions` table.
 */
const pool = require('../config/db');

async function findById(id) {
  const [rows] = await pool.execute(
    'SELECT id, patient_id, staff_id, created_at FROM chat_sessions WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

async function findByPatientId(patientId) {
  const [rows] = await pool.execute(
    `SELECT id, patient_id, staff_id, created_at FROM chat_sessions
     WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1`,
    [patientId]
  );
  return rows[0] || null;
}

async function create(patientId) {
  const [result] = await pool.execute('INSERT INTO chat_sessions (patient_id) VALUES (?)', [patientId]);
  return findById(result.insertId);
}

/** Assigns the first staff member who replies; later replies keep the original assignee. */
async function assignStaff(id, staffId) {
  await pool.execute('UPDATE chat_sessions SET staff_id = ? WHERE id = ? AND staff_id IS NULL', [staffId, id]);
  return findById(id);
}

/**
 * Every session with the patient's name, the assigned staff member and the
 * latest message - what the staff unified inbox needs (FR 5.2).
 */
async function findAllWithSummary() {
  const [rows] = await pool.execute(
    `SELECT s.id, s.patient_id, p.name AS patient_name, s.staff_id, st.name AS staff_name,
            s.created_at,
            m.content   AS last_message,
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

module.exports = { findById, findByPatientId, create, assignStaff, findAllWithSummary };
