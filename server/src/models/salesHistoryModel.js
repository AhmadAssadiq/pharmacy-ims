/**
 * Data access for the `sales_history` table.
 */
const pool = require('../config/db');

async function findAll() {
  const [rows] = await pool.execute(
    'SELECT id, medication_id, quantity_sold, date FROM sales_history ORDER BY medication_id, date'
  );
  return rows;
}

async function findByMedicationId(medicationId) {
  const [rows] = await pool.execute(
    'SELECT id, medication_id, quantity_sold, date FROM sales_history WHERE medication_id = ? ORDER BY date',
    [medicationId]
  );
  return rows;
}

/** Inserts many rows at once: [{ medication_id, quantity_sold, date }]. */
async function bulkInsert(records) {
  if (records.length === 0) return 0;
  const values = records.map((r) => [r.medication_id, r.quantity_sold, r.date]);
  const [result] = await pool.query(
    'INSERT INTO sales_history (medication_id, quantity_sold, date) VALUES ?',
    [values]
  );
  return result.affectedRows;
}

async function deleteAll() {
  await pool.execute('DELETE FROM sales_history');
}

module.exports = { findAll, findByMedicationId, bulkInsert, deleteAll };
