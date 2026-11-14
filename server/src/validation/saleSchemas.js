// What valid data looks like for a sale (dispensing) and for patient orders.
// See validate.js for how these are used and for the field builders.
import { z } from 'zod';
import createError from 'http-errors';
import {
  ERROR_CODES,
  PREORDER_STATUS,
  PREORDER_MAX_QUANTITY,
  PREORDER_NOTE_MAX_LENGTH,
  PREORDER_MAX_ITEMS,
  PAYMENT_METHOD,
} from '../constants.js';
import { wholeNumber, firstErrorPerField, validate } from './validate.js';

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

// The same 400 error that validate() throws
function validationError(details) {
  return createError(400, 'Validation failed', { code: ERROR_CODES.VALIDATION_FAILED, details });
}

// Checks a list of lines [{ medication_id, quantity }, ...] against `lineSchema`.
// Used for a sale's basket and for a patient's order.
// Returns the lines with the same medication merged together (2 + 1 Panadol = 3 Panadol),
// sorted by medication id. A fixed order matters: every sale locks the stock rows in the
// same order, so two sales running at once can never block each other (deadlock).
// Throws a 400 error naming the first bad line, e.g. "Line 2: Quantity must be at least 1".
// `emptyMessage` is the error for an empty list.
function checkAndMergeLines(items, lineSchema, emptyMessage) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) {
    throw validationError({ items: emptyMessage });
  }

  // Add up the quantity for each medication: { medicationId: totalQuantity }
  const totalByMedication = new Map();
  for (let index = 0; index < list.length; index++) {
    const result = lineSchema.safeParse(list[index] ?? {});
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

// Checks a whole sale ("basket"): { items: [{ medication_id, quantity }, ...] }.
// Returns the merged, sorted lines (see checkAndMergeLines).
export function validateSale(body) {
  return checkAndMergeLines(body?.items, saleLineSchema, 'Add at least one medication to the sale');
}

// ----------------------------------------------------------------------------
// Patient orders (GP2 addition)
// ----------------------------------------------------------------------------

const ALL_STATUSES = Object.values(PREORDER_STATUS);
const ALL_PAYMENT_METHODS = Object.values(PAYMENT_METHOD);

// One line of an order: the same as a sale line, but at most 100 units
const orderLineSchema = z.object({
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
});

// The rest of an order: an optional note and how it will be paid
const orderDetailsSchema = z.object({
  // Only text counts as a note; an empty note is stored as NULL
  note: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : ''),
    z
      .string()
      .max(PREORDER_NOTE_MAX_LENGTH, `Note must be at most ${PREORDER_NOTE_MAX_LENGTH} characters`)
      .transform((note) => (note === '' ? null : note))
  ),
  payment_method: z.preprocess(
    (value) => String(value ?? '').trim(),
    z.enum(ALL_PAYMENT_METHODS, { error: 'Choose cash or card' })
  ),
});

// Checks a patient's order: { items, note, payment_method }.
// The order is sent as a form (so a prescription photo can come with it), which means
// `items` arrives as JSON text: '[{"medication_id":3,"quantity":2}]'. A real list is
// accepted too. Returns { lines, note, payment_method } with the lines merged and sorted,
// or throws a 400 error with the field messages.
export function validateOrder(body) {
  let items = body?.items;
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch {
      throw validationError({ items: 'The list of medications could not be read' });
    }
  }

  const lines = checkAndMergeLines(items, orderLineSchema, 'Add at least one medication to the order');
  if (lines.length > PREORDER_MAX_ITEMS) {
    throw validationError({ items: `An order can hold at most ${PREORDER_MAX_ITEMS} different medications` });
  }

  const details = validate(orderDetailsSchema, { note: body?.note, payment_method: body?.payment_method });
  return { lines, note: details.note, payment_method: details.payment_method };
}

// A status name: pending, ready, collected or cancelled
const statusField = z.preprocess(
  (value) => String(value ?? '').trim(),
  z.enum(ALL_STATUSES, { error: `Status must be one of ${ALL_STATUSES.join(', ')}` })
);

// Staff changing an order's status: { status: 'ready' }
export const preorderStatusSchema = z.object({ status: statusField });

// The optional ?status= filter on the staff list. Returns the status, or null for "all".
export function validateStatusFilter(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return validate(preorderStatusSchema, { status: value }).status;
}

// The only status changes staff can make:
//   pending -> ready -> collected   (the order is fulfilled)
//   pending or ready -> cancelled   (the order is cancelled before collection)
// collected and cancelled are final.
const ALLOWED_CHANGES = {
  pending: ['ready', 'cancelled'],
  ready: ['collected', 'cancelled'],
  collected: [],
  cancelled: [],
};

// True when an order may go from status `from` to status `to`.
export function canChangeStatus(from, to) {
  const allowed = ALLOWED_CHANGES[from] || [];
  return allowed.includes(to);
}

// Staff deciding on a prescription: { decision: 'approve' } or
// { decision: 'reject', reason: 'The prescription has expired' }.
// A rejection must say why, because the patient is shown the reason.
export const prescriptionDecisionSchema = z
  .object({
    decision: z.preprocess(
      (value) => String(value ?? '').trim(),
      z.enum(['approve', 'reject'], { error: 'Choose approve or reject' })
    ),
    reason: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim() : ''),
      z.string().max(255, 'Reason must be at most 255 characters')
    ),
  })
  .refine((input) => input.decision !== 'reject' || input.reason !== '', {
    path: ['reason'],
    message: 'Say why the prescription is rejected',
  });
