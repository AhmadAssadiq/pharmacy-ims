// Keeps the demo sales history up to date (GP2 addition).
//
// The seed writes sales history up to the day before it runs. If the server is started days
// or weeks later, the days in between would have no sales, and the forecast would read that
// as demand dropping to zero. So before each forecast run, this fills every missing day -
// from a demo medication's first sale up to yesterday - with the numbers in
// data/demo-sales.json.
//
// A day that already has any sales row is never touched (that includes real sales made on
// the Dispense page), and medications that staff added themselves are left alone.
// A real pharmacy would switch this off with DEMO_SALES_TOPUP=false in server/.env.
import { config } from '../config.js';
import { todayAsText, addDaysToDate, listDatesBetween } from '../utils/dates.js';
import { findDemoSeries } from '../db/demoCatalog.js';
import { getDemoUnits } from '../db/demoSales.js';
import { getAllMedications } from './medicationService.js';
import { getSaleDatesOfMedication, insertSalesHistoryRows } from './salesService.js';

// The rows to add for one medication: one per day with no sales row, from its first
// recorded day up to yesterday. `recordedDates` are the days it already has (oldest first).
export function findMissingDays(medicationId, series, recordedDates, yesterday) {
  // A medication that was never seeded has nothing to continue
  if (recordedDates.length === 0) {
    return [];
  }

  // A Set makes "does this day already have sales?" a quick lookup
  const daysWithSales = new Set(recordedDates);

  const rows = [];
  for (const dateText of listDatesBetween(recordedDates[0], yesterday)) {
    if (daysWithSales.has(dateText)) {
      continue; // this day already has sales
    }
    const units = getDemoUnits(series, dateText);
    if (units !== null) {
      rows.push({ medication_id: medicationId, quantity_sold: units, date: dateText });
    }
  }
  return rows;
}

// Fills the missing days for every demo medication. Returns how many rows were added.
export async function fillMissingDemoSales() {
  if (!config.demoSalesTopUp) {
    return 0;
  }

  const yesterday = addDaysToDate(todayAsText(), -1);
  let addedCount = 0;
  for (const medication of await getAllMedications()) {
    const series = findDemoSeries(medication.name);
    if (!series) {
      continue; // not a demo medication
    }
    const recordedDates = await getSaleDatesOfMedication(medication.id);
    const rows = findMissingDays(medication.id, series, recordedDates, yesterday);
    addedCount += await insertSalesHistoryRows(rows);
  }
  return addedCount;
}
