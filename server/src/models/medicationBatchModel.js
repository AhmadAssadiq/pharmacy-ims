/**
 * Data access for the `medication_batches` table.
 *
 * Every function accepts an optional connection so the same parameterized SQL
 * runs either on the pool or inside a transaction (see services/salesService.js).
 */
const pool = require('../config/db');

const COLUMNS = 'id, medication_id, quantity, expiry_date, batch_number, received_date';

async function findById(id, conn = pool) {
  const [rows] = await conn.execute(`SELECT ${COLUMNS} FROM medication_batches WHERE id = ?`, [id]);
  return rows[0] || null;
}

async function findByMedicationId(medicationId, conn = pool) {
  const [rows] = await conn.execute(
    `SELECT ${COLUMNS} FROM medication_batches WHERE medication_id = ? ORDER BY expiry_date ASC, id ASC`,
    [medicationId]
  );
  return rows;
}

/**
 * Batches still holding stock, locked FOR UPDATE so two concurrent sales cannot
 * allocate the same units. Must be called inside a transaction.
 */
async function findInStockForUpdate(medicationId, conn) {
  const [rows] = await conn.execute(
    `SELECT ${COLUMNS} FROM medication_batches
     WHERE medication_id = ? AND quantity > 0
     ORDER BY expiry_date ASC, id ASC
     FOR UPDATE`,
    [medicationId]
  );
  return rows;
}

async function create({ medication_id, quantity, expiry_date, batch_number, received_date }, conn = pool) {
  const [result] = await conn.execute(
    `INSERT INTO medication_batches (medication_id, quantity, expiry_date, batch_number, received_date)
     VALUES (?, ?, ?, ?, ?)`,
    [
      medication_id,
      quantity,
      expiry_date,
      batch_number ?? null,
      received_date ?? new Date().toISOString().slice(0, 10),
    ]
  );
  return findById(result.insertId, conn);
}

async function update(id, { quantity, expiry_date, batch_number }, conn = pool) {
  await conn.execute(
    'UPDATE medication_batches SET quantity = ?, expiry_date = ?, batch_number = ? WHERE id = ?',
    [quantity, expiry_date, batch_number ?? null, id]
  );
  return findById(id, conn);
}

async function setQuantity(id, quantity, conn = pool) {
  await conn.execute('UPDATE medication_batches SET quantity = ? WHERE id = ?', [quantity, id]);
  return findById(id, conn);
}

async function remove(id, conn = pool) {
  const [result] = await conn.execute('DELETE FROM medication_batches WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

module.exports = { findById, findByMedicationId, findInStockForUpdate, create, update, setQuantity, remove };
