/**
 * Pure validation and status rules for preorders (GP2 addition).
 * Returns { valid, errors, value } like the other validation modules.
 */
const { PREORDER_STATUS, PREORDER_MAX_QUANTITY, PREORDER_NOTE_MAX_LENGTH } = require('../../../shared/constants.json');
const { validateSaleItem } = require('./salesValidation');
const { validateBatch } = require('./medicationValidation');

const STATUSES = Object.values(PREORDER_STATUS);

/**
 * The only moves staff can make. A request is either fulfilled
 * (pending -> ready -> collected) or cancelled before it is collected;
 * collected and cancelled are final.
 */
const TRANSITIONS = {
  [PREORDER_STATUS.PENDING]: [PREORDER_STATUS.READY, PREORDER_STATUS.CANCELLED],
  [PREORDER_STATUS.READY]: [PREORDER_STATUS.COLLECTED, PREORDER_STATUS.CANCELLED],
  [PREORDER_STATUS.COLLECTED]: [],
  [PREORDER_STATUS.CANCELLED]: [],
};

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

/** A patient's request: the same medication and quantity rules as a sale line, plus a cap and a note. */
function validateCreatePreorder(body = {}) {
  const { errors, value } = validateSaleItem(body);

  if (value.quantity > PREORDER_MAX_QUANTITY) {
    errors.quantity = `Quantity must be at most ${PREORDER_MAX_QUANTITY}`;
    delete value.quantity;
  }

  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > PREORDER_NOTE_MAX_LENGTH) {
    errors.note = `Note must be at most ${PREORDER_NOTE_MAX_LENGTH} characters`;
  } else {
    value.note = note || null;
  }

  return { valid: Object.keys(errors).length === 0, errors, value };
}

/** Staff status change: the body names the target status. */
function validateStatusUpdate(body = {}) {
  const status = String(body.status ?? '').trim();
  if (!STATUSES.includes(status)) {
    return { valid: false, errors: { status: `Status must be one of ${STATUSES.join(', ')}` }, value: {} };
  }
  return { valid: true, errors: {}, value: { status } };
}

/**
 * The delivery recorded when staff mark a request ready: the lot that came in
 * for it. It goes into stock like any received lot, so it must cover the
 * request, and it must still be in date after today, or the patient could not
 * collect it (expired lots are never dispensed). `today` is YYYY-MM-DD.
 */
function validateDelivery(raw, requestedQuantity, today = new Date().toISOString().slice(0, 10)) {
  const result = validateBatch(raw || {});
  const { errors, value } = result;
  if (!errors.quantity && value.quantity < requestedQuantity) {
    errors.quantity = `Must be at least the ${requestedQuantity} requested`;
  }
  if (!errors.expiry_date && value.expiry_date <= today) {
    errors.expiry_date = 'Expiry date must be after today';
  }
  return { valid: Object.keys(errors).length === 0, errors, value };
}

/** Optional ?status= filter on the staff list. */
function validateStatusFilter(raw) {
  if (raw === undefined || raw === null || raw === '') return { valid: true, errors: {}, value: { status: null } };
  return validateStatusUpdate({ status: raw });
}

module.exports = {
  validateCreatePreorder,
  validateStatusUpdate,
  validateStatusFilter,
  validateDelivery,
  canTransition,
  TRANSITIONS,
};
