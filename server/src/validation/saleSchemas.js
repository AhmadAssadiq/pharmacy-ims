// What valid data looks like for a sale (dispensing) and for preorders.
// See validate.js for how these are used and for the field builders.
import { z } from 'zod';
import createError from 'http-errors';
import { ERROR_CODES, PREORDER_STATUS, PREORDER_MAX_QUANTITY, PREORDER_NOTE_MAX_LENGTH } from '../constants.js';
import { wholeNumber, firstErrorPerField, validate } from './validate.js';
import { batchSchema } from './medicationSchemas.js';

// Which medication: a positive whole number (its id)
const medicationIdField = wholeNumber({
  min: 1,
  messages: {
    required: 'Select a medication',
    notWhole: 'Invalid medication',
    tooSmall: 'Invalid medication',
  },
});

// How many units: at least 1
const quantityField = wholeNumber({
  min: 1,
  messages: {
    required: 'Quantity is required',
    notWhole: 'Quantity must be a whole number',
    tooSmall: 'Quantity must be at least 1',
  },
});

// One line of a sale: a medication and how many units of it
export const saleLineSchema = z.object({
  medication_id: medicationIdField,
  quantity: quantityField,
});

// Checks a whole sale ("basket"): { items: [{ medication_id, quantity }, ...] }.
// Returns the lines with the same medication merged together (2 + 1 Panadol = 3 Panadol),
// sorted by medication id. A fixed order matters: every sale locks the stock rows in the
// same order, so two sales running at once can never block each other (deadlock).
// Throws a 400 error naming the first bad line, e.g. "Line 2: Quantity must be at least 1".
export function validateSale(body) {
  const items = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) {
    throw validationError({ items: 'Add at least one medication to the sale' });
  }

  // Add up the quantity for each medication: { medicationId: totalQuantity }
  const totalByMedication = new Map();
  for (let index = 0; index < items.length; index++) {
    const result = saleLineSchema.safeParse(items[index] ?? {});
    if (!result.success) {
      const firstMessage = Object.values(firstErrorPerField(result.error))[0];
      throw validationError({ items: `Line ${index + 1}: ${firstMessage}` });
    }
    const { medication_id, quantity } = result.data;
    const totalSoFar = totalByMedication.get(medication_id) || 0;
    totalByMedication.set(medication_id, totalSoFar + quantity);
  }

  // Turn the map back into a list of lines, lowest medication id first
  const lines = [];
  for (const [medication_id, quantity] of totalByMedication) {
    lines.push({ medication_id, quantity });
  }
  lines.sort((first, second) => first.medication_id - second.medication_id);
  return lines;
}

// The same 400 error that validate() throws
function validationError(details) {
  return createError(400, 'Validation failed', { code: ERROR_CODES.VALIDATION_FAILED, details });
}

// ----------------------------------------------------------------------------
// Preorders (GP2 addition)
// ----------------------------------------------------------------------------

const ALL_STATUSES = Object.values(PREORDER_STATUS);

// A patient's request: same rules as a sale line, at most 100 units, and an optional note.
export const newPreorderSchema = z.object({
  medication_id: medicationIdField,
  quantity: wholeNumber({
    min: 1,
    max: PREORDER_MAX_QUANTITY,
    messages: {
      required: 'Quantity is required',
      notWhole: 'Quantity must be a whole number',
      tooSmall: 'Quantity must be at least 1',
      tooBig: `Quantity must be at most ${PREORDER_MAX_QUANTITY}`,
    },
  }),
  // Only text counts as a note; an empty note is stored as NULL
  note: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : ''),
    z
      .string()
      .max(PREORDER_NOTE_MAX_LENGTH, `Note must be at most ${PREORDER_NOTE_MAX_LENGTH} characters`)
      .transform((note) => (note === '' ? null : note))
  ),
});

// A status name: pending, ready, collected or cancelled
const statusField = z.preprocess(
  (value) => String(value ?? '').trim(),
  z.enum(ALL_STATUSES, { error: `Status must be one of ${ALL_STATUSES.join(', ')}` })
);

// Staff changing a request's status: { status: 'ready' }
export const preorderStatusSchema = z.object({ status: statusField });

// The optional ?status= filter on the staff list. Returns the status, or null for "all".
export function validateStatusFilter(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return validate(preorderStatusSchema, { status: value }).status;
}

// The only status changes staff can make:
//   pending -> ready -> collected   (the request is fulfilled)
//   pending or ready -> cancelled   (the request is cancelled before collection)
// collected and cancelled are final.
const ALLOWED_CHANGES = {
  pending: ['ready', 'cancelled'],
  ready: ['collected', 'cancelled'],
  collected: [],
  cancelled: [],
};

// True when a request may go from status `from` to status `to`.
export function canChangeStatus(from, to) {
  const allowed = ALLOWED_CHANGES[from] || [];
  return allowed.includes(to);
}

// Checks the delivery staff record when marking a request ready: the stock lot that
// arrived for it. Besides the usual lot rules, it must cover the requested quantity and
// must not expire today or earlier (otherwise the patient could not collect it).
// Returns the cleaned lot, or throws a 400 error with the field messages.
export function validateDelivery(delivery, requestedQuantity, todayText) {
  const input = delivery ?? {};
  const result = batchSchema.safeParse(input);
  const errors = result.success ? {} : firstErrorPerField(result.error);

  // The quantity passed the usual rules: is it enough for the request?
  if (!errors.quantity && Number(String(input.quantity).trim()) < requestedQuantity) {
    errors.quantity = `Must be at least the ${requestedQuantity} requested`;
  }
  // The date passed the usual rules: is it still in date after today?
  if (!errors.expiry_date && String(input.expiry_date).trim() <= todayText) {
    errors.expiry_date = 'Expiry date must be after today';
  }

  if (Object.keys(errors).length > 0) {
    throw validationError(errors);
  }
  return result.data;
}
