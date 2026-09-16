/**
 * Computes the inventory flags shown on the staff dashboard (FR 4):
 * low stock (quantity below the medication's own reorder threshold) and near
 * expiry (the next lot to expire falls within 30 days). Pure function so it is
 * easy to test.
 *
 * `expiry_date` is the earliest unexpired lot still holding stock, so it is null
 * when a medication has no sellable stock at all.
 */
const { LOW_STOCK_THRESHOLD, NEAR_EXPIRY_DAYS } = require('../../../shared/constants.json');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysUntil(dateStr, today) {
  const target = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`);
  const base = new Date(`${today.toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((target - base) / MS_PER_DAY);
}

function computeStockFlags(
  medication,
  { today = new Date(), lowStockThreshold, nearExpiryDays = NEAR_EXPIRY_DAYS } = {}
) {
  const quantity = Number(medication.quantity);
  const threshold = Number(lowStockThreshold ?? medication.low_stock_threshold ?? LOW_STOCK_THRESHOLD);
  const daysUntilExpiry = medication.expiry_date ? daysUntil(medication.expiry_date, today) : null;

  return {
    is_out_of_stock: quantity <= 0,
    is_low_stock: quantity < threshold,
    is_near_expiry: daysUntilExpiry !== null && daysUntilExpiry <= nearExpiryDays,
    is_expired: daysUntilExpiry !== null && daysUntilExpiry < 0,
    days_until_expiry: daysUntilExpiry,
    low_stock_threshold: threshold,
  };
}

/** Returns a copy of the medication with the flag fields merged in. */
function withStockFlags(medication, options) {
  return { ...medication, ...computeStockFlags(medication, options) };
}

module.exports = { computeStockFlags, withStockFlags, daysUntil };
