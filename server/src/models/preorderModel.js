/**
 * Data access for the `preorders` table (GP2 addition).
 *
 * Reads join the patient's and the medication's names. Nothing here exposes
 * stock levels, prices or supplier details, so a patient's own list stays
 * within what FR 7 allows them to see.
 */
const pool = require('../config/db');

const SELECT = `SELECT p.id, p.patient_id, u.name AS patient_name, p.medication_id, m.name AS medication_name,
                       p.quantity, p.status, p.note, p.created_at, p.updated_at
                FROM preorders p
                JOIN users u ON u.id = p.patient_id
                JOIN medications m ON m.id = p.medication_id`;

const NEWEST_FIRST = 'ORDER BY p.created_at DESC, p.id DESC';

async function findById(id, conn = pool) {
  const [rows] = await conn.execute(`${SELECT} WHERE p.id = ?`, [id]);
  return rows[0] || null;
}

/** Locks the row for a status change. Must be called inside a transaction. */
async function findByIdForUpdate(id, conn) {
  const [rows] = await conn.execute(
    'SELECT id, patient_id, medication_id, quantity, status FROM preorders WHERE id = ? FOR UPDATE',
    [id]
  );
  return rows[0] || null;
}

async function findByPatientId(patientId) {
  const [rows] = await pool.execute(`${SELECT} WHERE p.patient_id = ? ${NEWEST_FIRST}`, [patientId]);
  return rows;
}

async function findAll({ status = null } = {}) {
  const [rows] = status
    ? await pool.execute(`${SELECT} WHERE p.status = ? ${NEWEST_FIRST}`, [status])
    : await pool.execute(`${SELECT} ${NEWEST_FIRST}`);
  return rows;
}

/** Throws ER_DUP_ENTRY when the patient already has a pending request for this medication. */
async function create({ patientId, medicationId, quantity, note }) {
  const [result] = await pool.execute(
    'INSERT INTO preorders (patient_id, medication_id, quantity, note) VALUES (?, ?, ?, ?)',
    [patientId, medicationId, quantity, note]
  );
  return findById(result.insertId);
}

async function updateStatus(id, status, conn = pool) {
  await conn.execute('UPDATE preorders SET status = ? WHERE id = ?', [status, id]);
}

/**
 * Cancels the request only if it is the patient's own and still pending, in
 * one statement, so it cannot slip past a staff member marking it ready.
 * Returns true when a row changed.
 */
async function cancelPendingForPatient(id, patientId) {
  const [result] = await pool.execute(
    "UPDATE preorders SET status = 'cancelled' WHERE id = ? AND patient_id = ? AND status = 'pending'",
    [id, patientId]
  );
  return result.affectedRows > 0;
}

module.exports = { findById, findByIdForUpdate, findByPatientId, findAll, create, updateStatus, cancelPendingForPatient };
