/**
 * Keeps the demo sales history up to date (GP2 addition).
 *
 * The seed writes history up to the day before it runs. When the server is
 * started days or weeks later, the days in between would have no sales, and
 * the forecast would read that as demand falling to zero. So before each
 * forecast run, every day from a demo medication's first sale up to yesterday
 * that has no sales_history row at all is filled from data/demo-sales.json.
 * A day that already has a row is never touched - that includes days with
 * real sales recorded through dispensing - and medications staff added
 * themselves are left alone.
 *
 * A real pharmacy would turn this off (DEMO_SALES_TOPUP=false): its history is
 * its own sales.
 */
const env = require('../config/env');
const medicationModel = require('../models/medicationModel');
const salesHistoryModel = require('../models/salesHistoryModel');
const { seriesFor } = require('../db/demoCatalog');
const demoSales = require('../db/demoSales');

/** The missing days of one medication, as rows ready to insert. */
function missingRows(medicationId, series, recordedDates, yesterday) {
  if (recordedDates.length === 0) return []; // never seeded: nothing to continue
  const recorded = new Set(recordedDates);
  return demoSales
    .datesBetween(recordedDates[0], yesterday)
    .filter((date) => !recorded.has(date))
    .map((date) => ({ medication_id: medicationId, quantity_sold: demoSales.unitsOn(series, date), date }))
    .filter((row) => row.quantity_sold !== null);
}

/** Fills the gaps up to yesterday. Returns the number of rows inserted. */
async function topUp(today = new Date().toISOString().slice(0, 10)) {
  if (!env.demoSalesTopUp) return 0;
  const yesterday = demoSales.addDays(today, -1);
  let inserted = 0;
  for (const medication of await medicationModel.findAll()) {
    const series = seriesFor(medication.name);
    if (!series) continue;
    const dates = await salesHistoryModel.findSaleDates(medication.id);
    const rows = missingRows(medication.id, series, dates, yesterday);
    for (let i = 0; i < rows.length; i += 1000) {
      inserted += await salesHistoryModel.bulkInsert(rows.slice(i, i + 1000));
    }
  }
  return inserted;
}

module.exports = { topUp, missingRows };
