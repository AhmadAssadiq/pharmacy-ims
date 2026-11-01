// Dispensing (selling) medications, and the sales_history table the forecast learns from (FR 6.1).
//
// A sale is a "basket": one or more lines, each a medication and a quantity.
// Recording a sale:
//   - takes the units from the stock lots that expire first (FEFO, see utils/fefo.js);
//   - writes one sales_history row per medication, which is how real demand reaches the model.
// The whole basket is one transaction: if any line cannot be filled, nothing is sold at all.
import createError from 'http-errors';
import { db, runInTransaction } from '../db.js';
import { ERROR_CODES } from '../constants.js';
import { allocateUnits, countSellableUnits } from '../utils/fefo.js';
import { todayAsText } from '../utils/dates.js';
import { findMedicationById, findBatchesOfMedication } from './medicationService.js';

// Rounds money to 2 decimals (4.8 * 3 = 14.399999 -> 14.4)
function roundMoney(amount) {
  return Math.round(amount * 100) / 100;
}

// Sells one basket line inside the caller's transaction.
// `line` is { medication_id, quantity }. Also used when a preorder is collected (preorderService.js),
// so both ways of handing out medication change stock in exactly the same way.
// Returns what was sold, including which lots it came from.
export async function dispenseLine(connection, line, dateText) {
  // 1. The medication must exist
  const medication = await findMedicationById(line.medication_id, connection);
  if (!medication) {
    throw createError(404, `Medication ${line.medication_id} not found`, { code: ERROR_CODES.MEDICATION_NOT_FOUND });
  }

  // 2. Read its lots that still hold stock and LOCK them (FOR UPDATE), so two sales at the
  //    same moment cannot both take the same units. The lock lasts until the transaction ends.
  const [batches] = await connection.query(
    `SELECT id, medication_id, quantity, expiry_date, batch_number, received_date
     FROM medication_batches
     WHERE medication_id = ? AND quantity > 0
     ORDER BY expiry_date ASC, id ASC
     FOR UPDATE`,
    [line.medication_id]
  );

  // 3. Decide how many units to take from each lot (soonest expiry first)
  const { allocations, shortfall } = allocateUnits(batches, line.quantity);
  if (shortfall > 0) {
    const available = countSellableUnits(batches);
    throw createError(400, `Not enough sellable stock for ${medication.name}`, {
      code: ERROR_CODES.STOCK_INSUFFICIENT,
      params: { name: medication.name, count: available },
      details: { items: `Only ${available} unit(s) of ${medication.name} available to dispense` },
    });
  }

  // 4. Take the units out of each lot
  for (const allocation of allocations) {
    await connection.query('UPDATE medication_batches SET quantity = ? WHERE id = ?', [
      allocation.remaining_after,
      allocation.batch_id,
    ]);
  }

  // 5. Record the sale for the forecast
  await connection.query('INSERT INTO sales_history (medication_id, quantity_sold, date) VALUES (?, ?, ?)', [
    line.medication_id,
    line.quantity,
    dateText,
  ]);

  const unitPrice = Number(medication.unit_price);
  return {
    medication_id: medication.id,
    medication_name: medication.name,
    quantity: line.quantity,
    unit_price: unitPrice,
    line_total: roundMoney(unitPrice * line.quantity),
    allocations,
  };
}

// Records a whole sale. `lines` are already validated, merged and sorted by medication id
// (see validateSale in validation/saleSchemas.js), so every sale locks rows in the same order.
// Returns { date, lines, total_quantity, total_price }.
export async function recordSale(lines) {
  const dateText = todayAsText();

  // Sell every line inside one transaction: one failure undoes the whole basket
  const soldLines = await runInTransaction(async (connection) => {
    const results = [];
    for (const line of lines) {
      results.push(await dispenseLine(connection, line, dateText));
    }
    return results;
  });

  // Add up the totals for the receipt
  let totalQuantity = 0;
  let totalPrice = 0;
  for (const line of soldLines) {
    totalQuantity += line.quantity;
    totalPrice += line.line_total;
  }

  return { date: dateText, lines: soldLines, total_quantity: totalQuantity, total_price: roundMoney(totalPrice) };
}

// Shows which lots one basket line would take units from, without selling anything.
// `line` is already validated: { medication_id, quantity }.
export async function previewSale(line) {
  const batches = await findBatchesOfMedication(line.medication_id);
  const { allocations, shortfall } = allocateUnits(batches, line.quantity);
  return { allocations, shortfall, available: countSellableUnits(batches) };
}

// The most recent sales with medication names, for the "Recent sales" list on the Dispense page.
export async function getRecentSales(limit = 20) {
  const [rows] = await db.query(
    `SELECT s.id, s.medication_id, m.name AS medication_name, s.quantity_sold, s.date
     FROM sales_history s
     JOIN medications m ON m.id = s.medication_id
     ORDER BY s.date DESC, s.id DESC
     LIMIT ?`,
    [limit]
  );
  return rows;
}

// ----------------------------------------------------------------------------
// sales_history helpers (used by the forecast, the seed and the demo top-up)
// ----------------------------------------------------------------------------

// Every sales_history row, grouped by medication and in date order.
export async function getAllSalesHistory() {
  const [rows] = await db.query(
    'SELECT id, medication_id, quantity_sold, date FROM sales_history ORDER BY medication_id, date'
  );
  return rows;
}

// The sales_history rows of one medication, in date order.
export async function getSalesHistoryOfMedication(medicationId) {
  const [rows] = await db.query(
    'SELECT id, medication_id, quantity_sold, date FROM sales_history WHERE medication_id = ? ORDER BY date',
    [medicationId]
  );
  return rows;
}

// The dates (oldest first) on which a medication has at least one sales_history row.
export async function getSaleDatesOfMedication(medicationId) {
  const [rows] = await db.query(
    'SELECT DISTINCT date FROM sales_history WHERE medication_id = ? ORDER BY date',
    [medicationId]
  );
  return rows.map((row) => String(row.date).slice(0, 10));
}

// Saves many sales_history rows at once: [{ medication_id, quantity_sold, date }, ...].
// They are sent 1000 at a time, because years of daily rows would make one huge INSERT.
// Returns how many rows were saved.
export async function insertSalesHistoryRows(rows) {
  let savedCount = 0;
  for (let start = 0; start < rows.length; start += 1000) {
    const chunk = rows.slice(start, start + 1000);
    const values = chunk.map((row) => [row.medication_id, row.quantity_sold, row.date]);
    const [result] = await db.query('INSERT INTO sales_history (medication_id, quantity_sold, date) VALUES ?', [
      values,
    ]);
    savedCount += result.affectedRows;
  }
  return savedCount;
}

// Deletes sales_history rows dated before `dateText` (used by the seed). Returns how many.
export async function deleteSalesHistoryBefore(dateText) {
  const [result] = await db.query('DELETE FROM sales_history WHERE date < ?', [dateText]);
  return result.affectedRows;
}
