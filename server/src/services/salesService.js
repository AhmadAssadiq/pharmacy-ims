/**
 * Dispensing / point of sale.
 *
 * A sale is a basket of one or more medications. Recording it depletes stock
 * nearest-expiry-first (FEFO, so short-dated lots leave the shelf before they
 * expire) and writes one `sales_history` row per medication - the table the
 * forecasting job trains on (FR 6.1), which is how real demand reaches the model.
 *
 * The whole basket runs in a single transaction with the batch rows locked, so
 * it is all-or-nothing: if any line cannot be filled, nothing is dispensed and
 * no stock moves. Lines are locked in medication id order so two pharmacists
 * ringing up overlapping baskets cannot deadlock each other.
 */
const pool = require('../config/db');
const medicationModel = require('../models/medicationModel');
const medicationBatchModel = require('../models/medicationBatchModel');
const salesHistoryModel = require('../models/salesHistoryModel');
const { validateSale, validateSaleItem } = require('../validation/salesValidation');
const fefo = require('../utils/fefo');
const HttpError = require('../utils/httpError');

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function dispenseLine(item, date, conn) {
  const medication = await medicationModel.findById(item.medication_id, conn);
  if (!medication) throw new HttpError(404, `Medication ${item.medication_id} not found`);

  const batches = await medicationBatchModel.findInStockForUpdate(item.medication_id, conn);
  const { allocations, shortfall } = fefo.allocate(batches, item.quantity);
  if (shortfall > 0) {
    throw new HttpError(400, `Not enough sellable stock for ${medication.name}`, {
      items: `Only ${fefo.sellableQuantity(batches)} unit(s) of ${medication.name} available to dispense`,
    });
  }

  for (const line of allocations) {
    await medicationBatchModel.setQuantity(line.batch_id, line.remaining_after, conn);
  }
  await salesHistoryModel.insertSale(
    { medication_id: item.medication_id, quantity_sold: item.quantity, date },
    conn
  );

  const unitPrice = Number(medication.unit_price);
  return {
    medication_id: medication.id,
    medication_name: medication.name,
    quantity: item.quantity,
    unit_price: unitPrice,
    line_total: Math.round(unitPrice * item.quantity * 100) / 100,
    allocations,
  };
}

async function recordSale(body) {
  const { valid, errors, value } = validateSale(body);
  if (!valid) throw new HttpError(400, 'Validation failed', errors);

  const date = today();
  const conn = await pool.getConnection();
  let lines;

  try {
    await conn.beginTransaction();
    lines = [];
    for (const item of value.items) {
      lines.push(await dispenseLine(item, date, conn));
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return {
    date,
    lines,
    total_quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
    total_price: Math.round(lines.reduce((sum, line) => sum + line.line_total, 0) * 100) / 100,
  };
}

/** Which lots a single basket line would draw from, without recording anything. */
async function previewSale(body) {
  const { valid, errors, value } = validateSaleItem(body);
  if (!valid) throw new HttpError(400, 'Validation failed', errors);

  const batches = await medicationBatchModel.findByMedicationId(value.medication_id);
  const { allocations, shortfall } = fefo.allocate(batches, value.quantity);
  return { allocations, shortfall, available: fefo.sellableQuantity(batches) };
}

async function listRecentSales(limit = 20) {
  return salesHistoryModel.findRecent(limit);
}

module.exports = { recordSale, previewSale, listRecentSales };
