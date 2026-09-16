/**
 * Pure validation for the dispensing payload.
 *
 * A sale is a basket: one or more lines, each naming a medication and a
 * quantity. Repeated medications are merged so their stock is allocated once,
 * and lines come back ordered by id to give the sale a deterministic lock order.
 */
function validateSaleItem(raw = {}) {
  const errors = {};
  const value = {};

  const medicationId = Number(raw.medication_id);
  if (raw.medication_id === undefined || raw.medication_id === null || raw.medication_id === '') {
    errors.medication_id = 'Select a medication';
  } else if (!Number.isInteger(medicationId) || medicationId <= 0) {
    errors.medication_id = 'Invalid medication';
  } else {
    value.medication_id = medicationId;
  }

  const rawQuantity = raw.quantity;
  if (rawQuantity === undefined || rawQuantity === null || rawQuantity === '') {
    errors.quantity = 'Quantity is required';
  } else {
    const quantity = typeof rawQuantity === 'number' ? rawQuantity : Number(String(rawQuantity).trim());
    if (!Number.isFinite(quantity) || !Number.isInteger(quantity)) {
      errors.quantity = 'Quantity must be a whole number';
    } else if (quantity <= 0) {
      errors.quantity = 'Quantity must be at least 1';
    } else {
      value.quantity = quantity;
    }
  }

  return { valid: Object.keys(errors).length === 0, errors, value };
}

function validateSale(body = {}) {
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return { valid: false, errors: { items: 'Add at least one medication to the sale' }, value: {} };
  }

  const merged = new Map();
  for (const [index, raw] of items.entries()) {
    const line = validateSaleItem(raw);
    if (!line.valid) {
      const [message] = Object.values(line.errors);
      return { valid: false, errors: { items: `Line ${index + 1}: ${message}` }, value: {} };
    }
    const { medication_id, quantity } = line.value;
    merged.set(medication_id, (merged.get(medication_id) || 0) + quantity);
  }

  return {
    valid: true,
    errors: {},
    value: {
      items: [...merged.entries()]
        .map(([medication_id, quantity]) => ({ medication_id, quantity }))
        .sort((a, b) => a.medication_id - b.medication_id),
    },
  };
}

module.exports = { validateSale, validateSaleItem };
