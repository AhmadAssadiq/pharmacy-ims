// Works out the warning flags shown next to each medication on the staff pages (FR 4):
//   - out of stock:  no sellable units left
//   - low stock:     fewer units than the medication's reorder threshold
//   - near expiry:   the next lot to expire does so within 30 days
//   - expired:       that lot's expiry date has already passed
import { LOW_STOCK_THRESHOLD, NEAR_EXPIRY_DAYS } from '../constants.js';
import { daysBetween, todayAsText } from './dates.js';

// Returns the flags for one medication.
// `medication` needs: quantity, expiry_date (the next lot to expire, or null when
// nothing sellable is left) and optionally low_stock_threshold.
// `todayText` is today's date as 'YYYY-MM-DD' (tests pass a fixed date).
export function computeStockFlags(medication, todayText = todayAsText()) {
  const quantity = Number(medication.quantity);

  // Use the medication's own reorder threshold, or the shared default (10) if it has none
  let threshold = LOW_STOCK_THRESHOLD;
  if (medication.low_stock_threshold !== undefined && medication.low_stock_threshold !== null) {
    threshold = Number(medication.low_stock_threshold);
  }

  // Days until the next lot expires (null when there is no sellable lot)
  let daysUntilExpiry = null;
  if (medication.expiry_date) {
    daysUntilExpiry = daysBetween(todayText, medication.expiry_date);
  }

  return {
    is_out_of_stock: quantity <= 0,
    is_low_stock: quantity < threshold,
    is_near_expiry: daysUntilExpiry !== null && daysUntilExpiry <= NEAR_EXPIRY_DAYS,
    is_expired: daysUntilExpiry !== null && daysUntilExpiry < 0,
    days_until_expiry: daysUntilExpiry,
    low_stock_threshold: threshold,
  };
}

// Returns a copy of the medication with its flags added to it.
export function addStockFlags(medication, todayText = todayAsText()) {
  return { ...medication, ...computeStockFlags(medication, todayText) };
}
