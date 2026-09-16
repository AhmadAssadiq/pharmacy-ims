/**
 * Data access for the `sales_history` table - both the synthetic history used to
 * train the forecasting model and the real dispensing records written by
 * services/salesService.js. The forecaster aggregates rows per calendar day, so
 * several sales of the same medication on one day need no special handling.
 */
const pool = require('../config/db');

async function findAll(conn = pool) {
  const [rows] = await conn.execute(
    'SELECT id, medication_id, quantity_sold, date FROM sales_history ORDER BY medication_id, date'
  );
  return rows;
}

async function findByMedicationId(medicationId, conn = pool) {
  const [rows] = await conn.execute(
    'SELECT id, medication_id, quantity_sold, date FROM sales_history WHERE medication_id = ? ORDER BY date',
    [medicationId]
  );
  return rows;
}

/** Most recent sales with medication names, for the staff dispensing page. */
async function findRecent(limit = 20, conn = pool) {
  const [rows] = await conn.query(
    `SELECT s.id, s.medication_id, m.name AS medication_name, s.quantity_sold, s.date
     FROM sales_history s
     JOIN medications m ON m.id = s.medication_id
     ORDER BY s.date DESC, s.id DESC
     LIMIT ?`,
    [limit]
  );
  return rows;
}

async function insertSale({ medication_id, quantity_sold, date }, conn = pool) {
  const [result] = await conn.execute(
    'INSERT INTO sales_history (medication_id, quantity_sold, date) VALUES (?, ?, ?)',
    [medication_id, quantity_sold, date]
  );
  return result.insertId;
}

/** Inserts many rows at once: [{ medication_id, quantity_sold, date }]. */
async function bulkInsert(records, conn = pool) {
  if (records.length === 0) return 0;
  const values = records.map((r) => [r.medication_id, r.quantity_sold, r.date]);
  const [result] = await conn.query(
    'INSERT INTO sales_history (medication_id, quantity_sold, date) VALUES ?',
    [values]
  );
  return result.affectedRows;
}

/**
 * Removes only the synthetic backfill (rows dated before `date`). Re-seeding
 * must never destroy real sales recorded through the dispensing flow.
 */
async function deleteBefore(date, conn = pool) {
  const [result] = await conn.execute('DELETE FROM sales_history WHERE date < ?', [date]);
  return result.affectedRows;
}

module.exports = { findAll, findByMedicationId, findRecent, insertSale, bulkInsert, deleteBefore };
