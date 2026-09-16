/**
 * Stock lot management (UC-1): receiving a delivery creates a new batch with its
 * own expiry date, and correcting a miscount adjusts an existing one.
 */
const medicationModel = require('../models/medicationModel');
const medicationBatchModel = require('../models/medicationBatchModel');
const { validateBatch } = require('../validation/medicationValidation');
const HttpError = require('../utils/httpError');

async function requireMedication(medicationId) {
  const medication = await medicationModel.findById(medicationId);
  if (!medication) throw new HttpError(404, 'Medication not found');
  return medication;
}

async function listBatches(medicationId) {
  await requireMedication(medicationId);
  return medicationBatchModel.findByMedicationId(medicationId);
}

/** Receiving stock: each delivery is recorded as its own lot. */
async function addBatch(medicationId, body) {
  await requireMedication(medicationId);
  const { valid, errors, value } = validateBatch(body);
  if (!valid) throw new HttpError(400, 'Validation failed', errors);

  return medicationBatchModel.create({
    medication_id: medicationId,
    ...value,
    received_date: new Date().toISOString().slice(0, 10),
  });
}

async function updateBatch(batchId, body) {
  const existing = await medicationBatchModel.findById(batchId);
  if (!existing) throw new HttpError(404, 'Batch not found');

  const { valid, errors, value } = validateBatch(body);
  if (!valid) throw new HttpError(400, 'Validation failed', errors);

  return medicationBatchModel.update(batchId, value);
}

async function deleteBatch(batchId) {
  const removed = await medicationBatchModel.remove(batchId);
  if (!removed) throw new HttpError(404, 'Batch not found');
}

module.exports = { listBatches, addBatch, updateBatch, deleteBatch };
