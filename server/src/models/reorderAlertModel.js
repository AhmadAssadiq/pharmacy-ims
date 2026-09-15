/**
 * Data access for the `reorder_alerts` table.
 */
const pool = require('../config/db');

const SELECT = `SELECT a.id, a.medication_id, m.name AS medication_name, m.quantity AS current_quantity,
                       a.predicted_date, a.days_until_threshold, a.status
                FROM reorder_alerts a JOIN medications m ON m.id = a.medication_id`;

async function findById(id) {
  const [rows] = await pool.execute(`${SELECT} WHERE a.id = ?`, [id]);
  return rows[0] || null;
}

async function findActive() {
  const [rows] = await pool.execute(
    `${SELECT} WHERE a.status = 'active' ORDER BY a.days_until_threshold ASC, m.name ASC`
  );
  return rows;
}

async function findActiveByMedicationId(medicationId) {
  const [rows] = await pool.execute(
    `${SELECT} WHERE a.medication_id = ? AND a.status = 'active' LIMIT 1`,
    [medicationId]
  );
  return rows[0] || null;
}

async function create({ medicationId, predictedDate, daysUntilThreshold }) {
  const [result] = await pool.execute(
    'INSERT INTO reorder_alerts (medication_id, predicted_date, days_until_threshold) VALUES (?, ?, ?)',
    [medicationId, predictedDate, daysUntilThreshold]
  );
  return findById(result.insertId);
}

async function updatePrediction(id, { predictedDate, daysUntilThreshold }) {
  await pool.execute(
    'UPDATE reorder_alerts SET predicted_date = ?, days_until_threshold = ? WHERE id = ?',
    [predictedDate, daysUntilThreshold, id]
  );
  return findById(id);
}

async function dismiss(id) {
  const [result] = await pool.execute(
    `UPDATE reorder_alerts SET status = 'dismissed' WHERE id = ? AND status = 'active'`,
    [id]
  );
  return result.affectedRows > 0;
}

/** Removes active alerts for a medication that is no longer predicted to run low. */
async function deleteActiveByMedicationId(medicationId) {
  await pool.execute(`DELETE FROM reorder_alerts WHERE medication_id = ? AND status = 'active'`, [
    medicationId,
  ]);
}

module.exports = {
  findById,
  findActive,
  findActiveByMedicationId,
  create,
  updatePrediction,
  dismiss,
  deleteActiveByMedicationId,
};
