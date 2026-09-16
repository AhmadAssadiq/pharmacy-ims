/**
 * Medication catalog management (FR 3, FR 3.1, FR 3.2, FR 4, UC-1).
 *
 * Stock is held as batches, so adding a medication also creates its first lot.
 * Changing stock afterwards goes through services/batchService.js (receiving a
 * delivery or correcting a lot) or services/salesService.js (dispensing).
 */
const pool = require('../config/db');
const medicationModel = require('../models/medicationModel');
const medicationBatchModel = require('../models/medicationBatchModel');
const { validateMedication, validateNewMedication } = require('../validation/medicationValidation');
const { withStockFlags } = require('../utils/stockFlags');
const HttpError = require('../utils/httpError');

async function listMedications() {
  const rows = await medicationModel.findAll();
  return rows.map((row) => withStockFlags(row));
}

async function getMedication(id) {
  const medication = await medicationModel.findById(id);
  if (!medication) throw new HttpError(404, 'Medication not found');
  return withStockFlags(medication);
}

/** Creates the catalog entry and its opening stock lot in one transaction. */
async function createMedication(body) {
  const { valid, errors, value, batch } = validateNewMedication(body);
  if (!valid) throw new HttpError(400, 'Validation failed', errors);

  const conn = await pool.getConnection();
  let medicationId;
  try {
    await conn.beginTransaction();
    const created = await medicationModel.create(value, conn);
    await medicationBatchModel.create(
      { medication_id: created.id, ...batch, received_date: new Date().toISOString().slice(0, 10) },
      conn
    );
    await conn.commit();
    medicationId = created.id;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return getMedication(medicationId);
}

/** Catalog fields only - quantity and expiry belong to the medication's batches. */
async function updateMedication(id, body) {
  await getMedication(id); // 404 if missing
  const { valid, errors, value } = validateMedication(body);
  if (!valid) throw new HttpError(400, 'Validation failed', errors);
  await medicationModel.update(id, value);
  return getMedication(id);
}

async function deleteMedication(id) {
  const removed = await medicationModel.remove(id);
  if (!removed) throw new HttpError(404, 'Medication not found');
}

module.exports = {
  listMedications,
  getMedication,
  createMedication,
  updateMedication,
  deleteMedication,
};
