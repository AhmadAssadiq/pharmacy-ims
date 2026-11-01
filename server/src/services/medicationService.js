// The medication catalogue and its stock lots (FR 3, FR 3.1, FR 3.2, FR 4, FR 7, UC-1).
//
// Stock is not stored on the medication itself. It is kept in the medication_batches table:
// one row per delivery ("lot"), each with its own quantity and expiry date. When we read a
// medication we add its lots up into three extra fields:
//   quantity         - units that can be sold (lots that have not expired)
//   expired_quantity - units in expired lots (shown so staff can clear them out)
//   expiry_date      - the expiry date of the next lot to expire (what FR 4 warns about)
import createError from 'http-errors';
import { db, runInTransaction } from '../db.js';
import { ERROR_CODES } from '../constants.js';
import { addStockFlags } from '../utils/stockFlags.js';
import { todayAsText } from '../utils/dates.js';

// The SELECT used for every medication read: catalogue columns plus the stock totals of its lots.
// CASE WHEN ... picks only the lots that match (e.g. not expired) before adding them up.
const SELECT_MEDICATIONS_WITH_STOCK = `
  SELECT m.id, m.name, m.category, m.unit_price, m.supplier_info, m.low_stock_threshold,
         COALESCE(SUM(CASE WHEN b.expiry_date >= CURDATE() THEN b.quantity END), 0) AS quantity,
         COALESCE(SUM(CASE WHEN b.expiry_date <  CURDATE() THEN b.quantity END), 0) AS expired_quantity,
         MIN(CASE WHEN b.quantity > 0 AND b.expiry_date >= CURDATE() THEN b.expiry_date END) AS expiry_date
  FROM medications m
  LEFT JOIN medication_batches b ON b.medication_id = m.id
`;

// MySQL returns SUM() results as text ('42'), so turn them into numbers.
function fixNumberColumns(row) {
  return {
    ...row,
    quantity: Number(row.quantity),
    expired_quantity: Number(row.expired_quantity),
    low_stock_threshold: Number(row.low_stock_threshold),
  };
}

// The error for a medication id that does not exist
function medicationNotFound() {
  return createError(404, 'Medication not found', { code: ERROR_CODES.MEDICATION_NOT_FOUND });
}

// The error for a batch id that does not exist
function batchNotFound() {
  return createError(404, 'Batch not found', { code: ERROR_CODES.BATCH_NOT_FOUND });
}

// ----------------------------------------------------------------------------
// Medications
// ----------------------------------------------------------------------------

// Finds one medication with its stock totals, or returns null.
// `connection` lets this run inside a transaction (see salesService.js); normally it is the pool.
export async function findMedicationById(id, connection = db) {
  const [rows] = await connection.query(`${SELECT_MEDICATIONS_WITH_STOCK} WHERE m.id = ? GROUP BY m.id`, [id]);
  if (rows.length === 0) {
    return null;
  }
  return fixNumberColumns(rows[0]);
}

// Every medication, A to Z, with its stock totals and warning flags.
export async function getAllMedications() {
  const [rows] = await db.query(`${SELECT_MEDICATIONS_WITH_STOCK} GROUP BY m.id ORDER BY m.name ASC`);
  return rows.map((row) => addStockFlags(fixNumberColumns(row)));
}

// One medication with its warning flags, or a 404 error.
export async function getMedication(id) {
  const medication = await findMedicationById(id);
  if (!medication) {
    throw medicationNotFound();
  }
  return addStockFlags(medication);
}

// Adds a new medication together with its first stock lot (both or neither are saved).
// `input` is already validated (newMedicationSchema).
export async function addMedication(input) {
  const medicationId = await runInTransaction(async (connection) => {
    const [result] = await connection.query(
      `INSERT INTO medications (name, category, unit_price, supplier_info, low_stock_threshold)
       VALUES (?, ?, ?, ?, ?)`,
      [input.name, input.category, input.unit_price, input.supplier_info, input.low_stock_threshold]
    );
    await insertBatch(connection, {
      medication_id: result.insertId,
      quantity: input.quantity,
      expiry_date: input.expiry_date,
      batch_number: input.batch_number,
    });
    return result.insertId;
  });

  return getMedication(medicationId);
}

// Changes a medication's catalogue details (not its stock - that lives in its lots).
// `input` is already validated (medicationSchema).
export async function updateMedication(id, input) {
  await getMedication(id); // 404 if it does not exist
  await db.query(
    `UPDATE medications
     SET name = ?, category = ?, unit_price = ?, supplier_info = ?, low_stock_threshold = ?
     WHERE id = ?`,
    [input.name, input.category, input.unit_price, input.supplier_info, input.low_stock_threshold, id]
  );
  return getMedication(id);
}

// Deletes a medication. Its lots, sales history, alerts and preorders go with it (ON DELETE CASCADE).
export async function deleteMedication(id) {
  const [result] = await db.query('DELETE FROM medications WHERE id = ?', [id]);
  if (result.affectedRows === 0) {
    throw medicationNotFound();
  }
}

// What patients may see (FR 7): only whether each medication is in stock.
// Quantities, prices and suppliers are never included.
export async function getAvailability() {
  const medications = await getAllMedications();
  return medications.map((medication) => ({
    id: medication.id,
    name: medication.name,
    category: medication.category,
    in_stock: medication.quantity > 0,
  }));
}

// ----------------------------------------------------------------------------
// Stock lots (batches)
// ----------------------------------------------------------------------------

// Finds one lot by id, or returns null.
async function findBatchById(id, connection = db) {
  const [rows] = await connection.query(
    'SELECT id, medication_id, quantity, expiry_date, batch_number, received_date FROM medication_batches WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

// All lots of a medication, soonest expiry first.
export async function findBatchesOfMedication(medicationId, connection = db) {
  const [rows] = await connection.query(
    `SELECT id, medication_id, quantity, expiry_date, batch_number, received_date
     FROM medication_batches WHERE medication_id = ? ORDER BY expiry_date ASC, id ASC`,
    [medicationId]
  );
  return rows;
}

// Saves a new lot and returns it. The received date is today.
// Also used when a preorder's delivery arrives (preorderService.js).
export async function insertBatch(connection, { medication_id, quantity, expiry_date, batch_number }) {
  const [result] = await connection.query(
    `INSERT INTO medication_batches (medication_id, quantity, expiry_date, batch_number, received_date)
     VALUES (?, ?, ?, ?, ?)`,
    [medication_id, quantity, expiry_date, batch_number ?? null, todayAsText()]
  );
  return findBatchById(result.insertId, connection);
}

// The lots of one medication (404 if the medication does not exist).
export async function getBatches(medicationId) {
  await getMedication(medicationId);
  return findBatchesOfMedication(medicationId);
}

// Receiving a delivery (UC-1): every delivery is saved as its own lot.
// `input` is already validated (batchSchema).
export async function addBatch(medicationId, input) {
  await getMedication(medicationId); // 404 if it does not exist
  return insertBatch(db, { medication_id: medicationId, ...input });
}

// Correcting a lot (for example after a miscount). `input` is already validated (batchSchema).
export async function updateBatch(batchId, input) {
  const existing = await findBatchById(batchId);
  if (!existing) {
    throw batchNotFound();
  }
  await db.query('UPDATE medication_batches SET quantity = ?, expiry_date = ?, batch_number = ? WHERE id = ?', [
    input.quantity,
    input.expiry_date,
    input.batch_number ?? null,
    batchId,
  ]);
  return findBatchById(batchId);
}

// Removes a lot.
export async function deleteBatch(batchId) {
  const [result] = await db.query('DELETE FROM medication_batches WHERE id = ?', [batchId]);
  if (result.affectedRows === 0) {
    throw batchNotFound();
  }
}
