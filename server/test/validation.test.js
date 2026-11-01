// Tests for the form checks in src/validation (zod schemas).
// They check that good data is accepted and cleaned up, and that bad data gets the right message.
import test from 'node:test';
import assert from 'node:assert/strict';
import { firstErrorPerField, validate } from '../src/validation/validate.js';
import { registerSchema, loginSchema, phoneSchema, forgotPasswordSchema, resetPasswordSchema } from '../src/validation/authSchemas.js';
import { medicationSchema, batchSchema, newMedicationSchema } from '../src/validation/medicationSchemas.js';
import {
  saleLineSchema,
  validateSale,
  newPreorderSchema,
  preorderStatusSchema,
  validateStatusFilter,
  canChangeStatus,
  validateDelivery,
} from '../src/validation/saleSchemas.js';
import { PREORDER_MAX_QUANTITY } from '../src/constants.js';

// Runs a schema and returns { data } when the input is valid, or { errors } with one message per field.
function check(schema, input) {
  const result = schema.safeParse(input);
  if (result.success) {
    return { data: result.data, errors: {} };
  }
  return { data: null, errors: firstErrorPerField(result.error) };
}

// Runs a function that should throw a validation error, and returns its field messages.
function errorsThrownBy(action) {
  try {
    action();
  } catch (error) {
    assert.equal(error.status, 400);
    assert.equal(error.code, 'VALIDATION_FAILED');
    return error.details;
  }
  assert.fail('expected a validation error');
}

// ---- accounts ----

test('register accepts a good form and lower-cases the email', () => {
  const { data, errors } = check(registerSchema, {
    name: ' Sara ',
    email: ' Sara@Example.COM ',
    password: 'password123',
    phone: '079 123 4567',
  });
  assert.deepEqual(errors, {});
  assert.equal(data.name, 'Sara');
  assert.equal(data.email, 'sara@example.com');
  assert.equal(data.phone, '0791234567');
});

test('register reports every missing field', () => {
  const { errors } = check(registerSchema, {});
  assert.equal(errors.name, 'Name is required');
  assert.equal(errors.email, 'Email is required');
  assert.equal(errors.password, 'Password is required');
  assert.equal(errors.phone, 'Phone number is required');
});

test('register rejects a malformed email and a short password', () => {
  const { errors } = check(registerSchema, { name: 'A', email: 'not-an-email', password: 'short', phone: '0791234567' });
  assert.equal(errors.email, 'Email address is not valid');
  assert.equal(errors.password, 'Password must be at least 8 characters');
});

test('phone numbers are cleaned up the way people type them (GP2 addition)', () => {
  assert.equal(check(phoneSchema, { phone: '+962 (79) 123-4567' }).data.phone, '+962791234567');
  assert.equal(check(phoneSchema, { phone: '00962791234567' }).data.phone, '+962791234567');
  assert.equal(check(phoneSchema, { phone: '12345' }).errors.phone, 'Phone number is not valid');
  assert.equal(check(phoneSchema, { phone: '079-ABC-4567' }).errors.phone, 'Phone number is not valid');
  assert.equal(check(phoneSchema, { phone: '+1234567890123456' }).errors.phone, 'Phone number is not valid');
});

test('login needs both an email and a password', () => {
  assert.ok(check(loginSchema, { email: 'a@b.co' }).errors.password);
  assert.ok(check(loginSchema, { password: 'x' }).errors.email);
  assert.deepEqual(check(loginSchema, { email: 'a@b.co', password: 'x' }).errors, {});
});

test('forgot password accepts a good email and picks the email language', () => {
  assert.deepEqual(check(forgotPasswordSchema, { email: ' Sara@Mail.com ', lang: 'ar' }).data, {
    email: 'sara@mail.com',
    lang: 'ar',
  });
  assert.equal(check(forgotPasswordSchema, { email: 'sara@mail.com', lang: 'fr' }).data.lang, 'en');
  assert.equal(check(forgotPasswordSchema, { email: 'nope' }).errors.email, 'Email address is not valid');
});

test('reset password needs a 64-character token and a valid new password', () => {
  const token = 'a'.repeat(64);
  assert.deepEqual(check(resetPasswordSchema, { token, password: 'newpassword' }).errors, {});
  assert.equal(check(resetPasswordSchema, { token: 'abc', password: 'newpassword' }).errors.token, 'Reset link is not valid');
  assert.ok(check(resetPasswordSchema, { token, password: 'short' }).errors.password);
});

// ---- medications and stock lots ----

const GOOD_MEDICATION = { name: 'Panadol', category: 'Analgesic', unit_price: '1.5', supplier_info: 'Hikma' };
const GOOD_BATCH = { quantity: '120', expiry_date: '2027-06-30' };

test('a new medication is checked together with its first stock lot, and numbers are converted', () => {
  const { data, errors } = check(newMedicationSchema, { ...GOOD_MEDICATION, ...GOOD_BATCH });
  assert.deepEqual(errors, {});
  assert.equal(data.unit_price, 1.5);
  assert.equal(data.quantity, 120);
  assert.equal(data.expiry_date, '2027-06-30');
});

test('every catalogue field from FR 3.1 is required, and stock errors are reported too', () => {
  const { errors } = check(newMedicationSchema, {});
  for (const field of ['name', 'category', 'unit_price', 'supplier_info', 'quantity', 'expiry_date']) {
    assert.ok(errors[field], `${field} should be reported`);
  }
});

test('the reorder threshold defaults to 10 and accepts a whole number of 0 or more', () => {
  assert.equal(check(medicationSchema, GOOD_MEDICATION).data.low_stock_threshold, 10);
  assert.equal(check(medicationSchema, { ...GOOD_MEDICATION, low_stock_threshold: '' }).data.low_stock_threshold, 10);
  assert.equal(check(medicationSchema, { ...GOOD_MEDICATION, low_stock_threshold: '25' }).data.low_stock_threshold, 25);
  assert.equal(check(medicationSchema, { ...GOOD_MEDICATION, low_stock_threshold: 0 }).data.low_stock_threshold, 0);
  assert.equal(
    check(medicationSchema, { ...GOOD_MEDICATION, low_stock_threshold: -1 }).errors.low_stock_threshold,
    'Reorder threshold cannot be negative'
  );
  assert.equal(
    check(medicationSchema, { ...GOOD_MEDICATION, low_stock_threshold: 2.5 }).errors.low_stock_threshold,
    'Reorder threshold must be a whole number'
  );
});

test('prices are rounded to 2 decimals and cannot be negative', () => {
  assert.equal(check(medicationSchema, { ...GOOD_MEDICATION, unit_price: '2.505' }).data.unit_price, 2.51);
  assert.equal(check(medicationSchema, { ...GOOD_MEDICATION, unit_price: -1 }).errors.unit_price, 'Unit price cannot be negative');
  assert.equal(check(medicationSchema, { ...GOOD_MEDICATION, unit_price: 'abc' }).errors.unit_price, 'Unit price must be a number');
});

test('a stock lot needs a whole, non-negative quantity (UC-1 alternative flow)', () => {
  assert.equal(check(batchSchema, { ...GOOD_BATCH, quantity: -5 }).errors.quantity, 'Quantity cannot be negative');
  assert.equal(check(batchSchema, { ...GOOD_BATCH, quantity: 2.5 }).errors.quantity, 'Quantity must be a whole number');
  assert.equal(check(batchSchema, { ...GOOD_BATCH, quantity: 'ten' }).errors.quantity, 'Quantity must be a whole number');
  assert.equal(check(batchSchema, { expiry_date: '2027-06-30' }).errors.quantity, 'Quantity is required');
});

test('a stock lot needs a real expiry date written as YYYY-MM-DD', () => {
  assert.equal(check(batchSchema, { quantity: 1 }).errors.expiry_date, 'Expiry date is required');
  assert.ok(check(batchSchema, { ...GOOD_BATCH, expiry_date: '2027-02-30' }).errors.expiry_date);
  assert.ok(check(batchSchema, { ...GOOD_BATCH, expiry_date: '30/06/2027' }).errors.expiry_date);
});

test('the batch number is optional, trimmed, and at most 60 characters', () => {
  assert.equal(check(batchSchema, { ...GOOD_BATCH, batch_number: ' AMX-2502 ' }).data.batch_number, 'AMX-2502');
  assert.equal(check(batchSchema, GOOD_BATCH).data.batch_number, null);
  assert.ok(check(batchSchema, { ...GOOD_BATCH, batch_number: 'x'.repeat(61) }).errors.batch_number);
});

test('validate() throws a 400 with the field messages, or returns the cleaned data', () => {
  const details = errorsThrownBy(() => validate(batchSchema, { quantity: -1 }));
  assert.equal(details.quantity, 'Quantity cannot be negative');
  assert.equal(validate(batchSchema, GOOD_BATCH).quantity, 120);
  // A request with no body at all is treated as an empty form
  assert.ok(errorsThrownBy(() => validate(batchSchema, undefined)).quantity);
});

// ---- sales ----

test('a sale merges a medication that appears twice and sorts lines by medication id', () => {
  const lines = validateSale({
    items: [
      { medication_id: '5', quantity: '2' },
      { medication_id: 3, quantity: 4 },
      { medication_id: 3, quantity: 3 },
    ],
  });
  assert.deepEqual(lines, [
    { medication_id: 3, quantity: 7 },
    { medication_id: 5, quantity: 2 },
  ]);
});

test('an empty sale is refused, and a bad line is reported by its number', () => {
  assert.equal(errorsThrownBy(() => validateSale({})).items, 'Add at least one medication to the sale');
  assert.equal(errorsThrownBy(() => validateSale({ items: [] })).items, 'Add at least one medication to the sale');
  const details = errorsThrownBy(() => validateSale({ items: [{ medication_id: 1, quantity: 1 }, { medication_id: 2, quantity: 0 }] }));
  assert.equal(details.items, 'Line 2: Quantity must be at least 1');
});

test('a sale line needs a medication and a positive whole quantity', () => {
  assert.equal(check(saleLineSchema, { quantity: 1 }).errors.medication_id, 'Select a medication');
  assert.equal(check(saleLineSchema, { medication_id: 'abc', quantity: 1 }).errors.medication_id, 'Invalid medication');
  assert.equal(check(saleLineSchema, { medication_id: 3 }).errors.quantity, 'Quantity is required');
  assert.equal(check(saleLineSchema, { medication_id: 3, quantity: 0 }).errors.quantity, 'Quantity must be at least 1');
  assert.equal(check(saleLineSchema, { medication_id: 3, quantity: 1.5 }).errors.quantity, 'Quantity must be a whole number');
});

// ---- preorders (GP2 addition) ----

test('a preorder trims its note and stores an empty note as null', () => {
  assert.deepEqual(check(newPreorderSchema, { medication_id: 7, quantity: '2', note: ' for my mother ' }).data, {
    medication_id: 7,
    quantity: 2,
    note: 'for my mother',
  });
  assert.equal(check(newPreorderSchema, { medication_id: 1, quantity: 1, note: '   ' }).data.note, null);
  assert.equal(check(newPreorderSchema, { medication_id: 1, quantity: 1 }).data.note, null);
});

test('a preorder is capped at 100 units and 500 characters of note', () => {
  assert.deepEqual(check(newPreorderSchema, { medication_id: 1, quantity: PREORDER_MAX_QUANTITY }).errors, {});
  assert.equal(
    check(newPreorderSchema, { medication_id: 1, quantity: PREORDER_MAX_QUANTITY + 1 }).errors.quantity,
    `Quantity must be at most ${PREORDER_MAX_QUANTITY}`
  );
  assert.ok(check(newPreorderSchema, { medication_id: 1, quantity: 1, note: 'x'.repeat(501) }).errors.note);
});

test('only the documented status changes are allowed', () => {
  assert.equal(canChangeStatus('pending', 'ready'), true);
  assert.equal(canChangeStatus('pending', 'cancelled'), true);
  assert.equal(canChangeStatus('ready', 'collected'), true);
  assert.equal(canChangeStatus('ready', 'cancelled'), true);
  assert.equal(canChangeStatus('pending', 'collected'), false); // cannot skip "ready"
  assert.equal(canChangeStatus('collected', 'cancelled'), false); // collected is final
  assert.equal(canChangeStatus('cancelled', 'pending'), false); // cancelled is final
});

test('the status and the list filter must be a known status', () => {
  assert.equal(check(preorderStatusSchema, { status: ' ready ' }).data.status, 'ready');
  assert.equal(
    check(preorderStatusSchema, { status: 'shipped' }).errors.status,
    'Status must be one of pending, ready, collected, cancelled'
  );
  assert.equal(validateStatusFilter(undefined), null);
  assert.equal(validateStatusFilter('pending'), 'pending');
  assert.throws(() => validateStatusFilter('nope'));
});

test('a delivery marked "ready" must cover the request and still be in date after today', () => {
  const today = '2026-09-16';
  assert.deepEqual(validateDelivery({ quantity: 5, expiry_date: '2027-03-01', batch_number: 'OME-77' }, 2, today), {
    quantity: 5,
    expiry_date: '2027-03-01',
    batch_number: 'OME-77',
  });
  assert.match(errorsThrownBy(() => validateDelivery({ quantity: 1, expiry_date: '2027-03-01' }, 2, today)).quantity, /at least the 2/);
  assert.ok(errorsThrownBy(() => validateDelivery({ quantity: 2, expiry_date: today }, 2, today)).expiry_date);
  assert.ok(errorsThrownBy(() => validateDelivery({ quantity: 2 }, 2, today)).expiry_date);
  assert.ok(errorsThrownBy(() => validateDelivery(undefined, 2, today)).quantity);
});
