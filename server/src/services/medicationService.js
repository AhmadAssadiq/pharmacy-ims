/**
 * Medication catalog management (FR 3, FR 3.1, FR 3.2, FR 4, UC-1).
 */
const medicationModel = require('../models/medicationModel');
const { validateMedication, validateQuantityUpdate } = require('../validation/medicationValidation');
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

async function createMedication(body) {
  const { valid, errors, value } = validateMedication(body);
  if (!valid) throw new HttpError(400, 'Validation failed', errors);
  const created = await medicationModel.create(value);
  return withStockFlags(created);
}

async function updateMedication(id, body) {
  await getMedication(id); // 404 if missing
  const { valid, errors, value } = validateMedication(body);
  if (!valid) throw new HttpError(400, 'Validation failed', errors);
  const updated = await medicationModel.update(id, value);
  return withStockFlags(updated);
}

/** UC-1: change only the stock quantity. Invalid (e.g. negative) values are rejected and nothing is saved. */
async function updateQuantity(id, body) {
  const existing = await getMedication(id);
  const { valid, errors, value } = validateQuantityUpdate(body);
  if (!valid) throw new HttpError(400, 'Validation failed', errors);
  const updated = await medicationModel.update(id, { ...existing, quantity: value.quantity });
  return withStockFlags(updated);
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
  updateQuantity,
  deleteMedication,
};
