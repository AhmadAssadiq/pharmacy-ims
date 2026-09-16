/**
 * Pure validation for medication and batch payloads (FR 3.1, UC-1).
 * Returns { valid, errors, value } with the value coerced to the right types.
 *
 * Catalog fields and stock are validated separately: stock arrives as a batch
 * (quantity + expiry date), so adding a medication validates both at once while
 * editing one validates only the catalog fields.
 */
const { LOW_STOCK_THRESHOLD } = require('../../../shared/constants.json');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LIMITS = { name: 150, category: 100, supplier_info: 255, batch_number: 60 };

function isValidDate(str) {
  if (!DATE_PATTERN.test(str)) return false;
  const date = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === str;
}

/** Validates a quantity value: must be a whole number >= 0 (negative is rejected). */
function validateQuantityValue(raw) {
  if (raw === undefined || raw === null || raw === '') return { error: 'Quantity is required' };
  const quantity = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity)) {
    return { error: 'Quantity must be a whole number' };
  }
  if (quantity < 0) return { error: 'Quantity cannot be negative' };
  return { value: quantity };
}

function validatePriceValue(raw) {
  if (raw === undefined || raw === null || raw === '') return { error: 'Unit price is required' };
  const price = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(price)) return { error: 'Unit price must be a number' };
  if (price < 0) return { error: 'Unit price cannot be negative' };
  return { value: Math.round(price * 100) / 100 };
}

/** Optional per-medication reorder threshold; falls back to the shared default. */
function validateThresholdValue(raw) {
  if (raw === undefined || raw === null || raw === '') return { value: LOW_STOCK_THRESHOLD };
  const threshold = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(threshold) || !Number.isInteger(threshold)) {
    return { error: 'Reorder threshold must be a whole number' };
  }
  if (threshold < 0) return { error: 'Reorder threshold cannot be negative' };
  return { value: threshold };
}

function requiredText(raw, field, label) {
  const text = String(raw ?? '').trim();
  if (!text) return { error: `${label} is required` };
  if (text.length > LIMITS[field]) return { error: `${label} must be at most ${LIMITS[field]} characters` };
  return { value: text };
}

function collect(checks) {
  const errors = {};
  const value = {};
  for (const [field, result] of Object.entries(checks)) {
    if (result.error) errors[field] = result.error;
    else value[field] = result.value;
  }
  return { valid: Object.keys(errors).length === 0, errors, value };
}

/** Catalog fields only - stock and expiry live on batches (create / update). */
function validateMedication(body = {}) {
  return collect({
    name: requiredText(body.name, 'name', 'Name'),
    category: requiredText(body.category, 'category', 'Category'),
    unit_price: validatePriceValue(body.unit_price),
    supplier_info: requiredText(body.supplier_info, 'supplier_info', 'Supplier information'),
    low_stock_threshold: validateThresholdValue(body.low_stock_threshold),
  });
}

/** A single stock lot: quantity, its own expiry date and an optional lot number. */
function validateBatch(body = {}) {
  const result = collect({
    quantity: validateQuantityValue(body.quantity),
    expiry_date: validateExpiry(body.expiry_date),
  });

  const batchNumber = String(body.batch_number ?? '').trim();
  if (batchNumber.length > LIMITS.batch_number) {
    result.errors.batch_number = `Batch number must be at most ${LIMITS.batch_number} characters`;
    return { ...result, valid: false };
  }
  result.value.batch_number = batchNumber || null;
  return result;
}

function validateExpiry(raw) {
  const expiry = String(raw ?? '').trim();
  if (!expiry) return { error: 'Expiry date is required' };
  if (!isValidDate(expiry)) return { error: 'Expiry date must be a valid date (YYYY-MM-DD)' };
  return { value: expiry };
}

/** Adding a medication also creates its first stock lot, so both are validated. */
function validateNewMedication(body = {}) {
  const medication = validateMedication(body);
  const batch = validateBatch(body);
  return {
    valid: medication.valid && batch.valid,
    errors: { ...medication.errors, ...batch.errors },
    value: medication.value,
    batch: batch.value,
  };
}

module.exports = { validateMedication, validateBatch, validateNewMedication, isValidDate };
