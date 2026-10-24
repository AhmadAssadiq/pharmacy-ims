const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateCreatePreorder,
  validateStatusUpdate,
  validateStatusFilter,
  validateDelivery,
  canTransition,
} = require('../src/validation/preorderValidation');
const { PREORDER_MAX_QUANTITY, PREORDER_NOTE_MAX_LENGTH } = require('../../shared/constants.json');

test('accepts a request and trims the note (GP2 addition)', () => {
  const result = validateCreatePreorder({ medication_id: '7', quantity: '2', note: '  for my mother  ' });
  assert.equal(result.valid, true);
  assert.deepEqual(result.value, { medication_id: 7, quantity: 2, note: 'for my mother' });
});

test('an empty note is stored as no note', () => {
  assert.equal(validateCreatePreorder({ medication_id: 1, quantity: 1, note: '   ' }).value.note, null);
  assert.equal(validateCreatePreorder({ medication_id: 1, quantity: 1 }).value.note, null);
});

test('rejects a missing medication and a quantity below 1', () => {
  const result = validateCreatePreorder({ quantity: 0 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.medication_id);
  assert.ok(result.errors.quantity);
});

test('caps the quantity a patient can request', () => {
  assert.equal(validateCreatePreorder({ medication_id: 1, quantity: PREORDER_MAX_QUANTITY }).valid, true);
  const over = validateCreatePreorder({ medication_id: 1, quantity: PREORDER_MAX_QUANTITY + 1 });
  assert.equal(over.valid, false);
  assert.match(over.errors.quantity, /at most/);
});

test('rejects a fractional quantity and an over-long note', () => {
  assert.equal(validateCreatePreorder({ medication_id: 1, quantity: 1.5 }).valid, false);
  const long = validateCreatePreorder({ medication_id: 1, quantity: 1, note: 'x'.repeat(PREORDER_NOTE_MAX_LENGTH + 1) });
  assert.equal(long.valid, false);
  assert.ok(long.errors.note);
});

test('allows exactly the documented status transitions', () => {
  const allowed = [
    ['pending', 'ready'],
    ['pending', 'cancelled'],
    ['ready', 'collected'],
    ['ready', 'cancelled'],
  ];
  const statuses = ['pending', 'ready', 'collected', 'cancelled'];
  for (const from of statuses) {
    for (const to of statuses) {
      const expected = allowed.some(([a, b]) => a === from && b === to);
      assert.equal(canTransition(from, to), expected, `${from} -> ${to}`);
    }
  }
});

test('pending cannot skip straight to collected', () => {
  assert.equal(canTransition('pending', 'collected'), false);
});

test('validates the target status and the list filter', () => {
  assert.equal(validateStatusUpdate({ status: 'ready' }).valid, true);
  assert.equal(validateStatusUpdate({ status: 'shipped' }).valid, false);
  assert.equal(validateStatusUpdate({}).valid, false);
  assert.deepEqual(validateStatusFilter(undefined).value, { status: null });
  assert.equal(validateStatusFilter('pending').value.status, 'pending');
  assert.equal(validateStatusFilter('nope').valid, false);
});

test('a delivery recorded on "ready" must cover the request and still be in date', () => {
  const today = '2026-10-24';
  const ok = validateDelivery({ quantity: '5', expiry_date: '2027-03-01', batch_number: ' OME-77 ' }, 2, today);
  assert.equal(ok.valid, true);
  assert.deepEqual(ok.value, { quantity: 5, expiry_date: '2027-03-01', batch_number: 'OME-77' });

  assert.match(validateDelivery({ quantity: 1, expiry_date: '2027-03-01' }, 2, today).errors.quantity, /at least the 2/);
  assert.ok(validateDelivery({ quantity: 2, expiry_date: today }, 2, today).errors.expiry_date, 'expiring today cannot be collected later');
  assert.ok(validateDelivery({ quantity: 2, expiry_date: '2026-01-01' }, 2, today).errors.expiry_date);
  assert.ok(validateDelivery({ quantity: 2 }, 2, today).errors.expiry_date);
  assert.ok(validateDelivery(undefined, 2, today).errors.quantity);
});
