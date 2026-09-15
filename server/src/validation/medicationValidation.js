/**
 * Pure validation for medication payloads (FR 3.1, UC-1).
 * Returns { valid, errors, value } with the value coerced to the right types.
 */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LIMITS = { name: 150, category: 100, supplier_info: 255 };

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

function requiredText(raw, field, label) {
  const text = String(raw ?? '').trim();
  if (!text) return { error: `${label} is required` };
  if (text.length > LIMITS[field]) return { error: `${label} must be at most ${LIMITS[field]} characters` };
  return { value: text };
}

/** Full medication payload (create / update). */
function validateMedication(body = {}) {
  const errors = {};
  const value = {};

  const checks = {
    name: requiredText(body.name, 'name', 'Name'),
    category: requiredText(body.category, 'category', 'Category'),
    quantity: validateQuantityValue(body.quantity),
    unit_price: validatePriceValue(body.unit_price),
    supplier_info: requiredText(body.supplier_info, 'supplier_info', 'Supplier information'),
  };

  for (const [field, result] of Object.entries(checks)) {
    if (result.error) errors[field] = result.error;
    else value[field] = result.value;
  }

  const expiry = String(body.expiry_date ?? '').trim();
  if (!expiry) errors.expiry_date = 'Expiry date is required';
  else if (!isValidDate(expiry)) errors.expiry_date = 'Expiry date must be a valid date (YYYY-MM-DD)';
  else value.expiry_date = expiry;

  return { valid: Object.keys(errors).length === 0, errors, value };
}

/** Quantity-only payload used by the quick stock update (UC-1). */
function validateQuantityUpdate(body = {}) {
  const result = validateQuantityValue(body.quantity);
  if (result.error) return { valid: false, errors: { quantity: result.error }, value: {} };
  return { valid: true, errors: {}, value: { quantity: result.value } };
}

module.exports = { validateMedication, validateQuantityUpdate, isValidDate };
