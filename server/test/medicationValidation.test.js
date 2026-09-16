const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateMedication,
  validateBatch,
  validateNewMedication,
} = require('../src/validation/medicationValidation');

const VALID_CATALOG = {
  name: 'Paracetamol 500mg',
  category: 'Analgesic',
  unit_price: '1.5',
  supplier_info: 'Hikma Pharmaceuticals',
};
const VALID_BATCH = { quantity: '120', expiry_date: '2027-06-30' };

test('accepts a complete new medication and coerces numeric fields', () => {
  const result = validateNewMedication({ ...VALID_CATALOG, ...VALID_BATCH });
  assert.equal(result.valid, true);
  assert.equal(result.value.unit_price, 1.5);
  assert.equal(result.batch.quantity, 120);
  assert.equal(result.batch.expiry_date, '2027-06-30');
});

test('requires every catalog field from FR 3.1', () => {
  const result = validateMedication({});
  assert.equal(result.valid, false);
  for (const field of ['name', 'category', 'unit_price', 'supplier_info']) {
    assert.ok(result.errors[field], `${field} should be reported`);
  }
});

test('reports catalog and stock errors together when adding a medication', () => {
  const result = validateNewMedication({});
  assert.equal(result.valid, false);
  for (const field of ['name', 'category', 'unit_price', 'supplier_info', 'quantity', 'expiry_date']) {
    assert.ok(result.errors[field], `${field} should be reported`);
  }
});

test('defaults the reorder threshold to the shared constant', () => {
  assert.equal(validateMedication(VALID_CATALOG).value.low_stock_threshold, 10);
  assert.equal(validateMedication({ ...VALID_CATALOG, low_stock_threshold: '' }).value.low_stock_threshold, 10);
});

test('accepts a per-medication reorder threshold', () => {
  assert.equal(validateMedication({ ...VALID_CATALOG, low_stock_threshold: '25' }).value.low_stock_threshold, 25);
  assert.equal(validateMedication({ ...VALID_CATALOG, low_stock_threshold: 0 }).value.low_stock_threshold, 0);
});

test('rejects a negative or fractional reorder threshold', () => {
  assert.equal(
    validateMedication({ ...VALID_CATALOG, low_stock_threshold: -1 }).errors.low_stock_threshold,
    'Reorder threshold cannot be negative'
  );
  assert.equal(
    validateMedication({ ...VALID_CATALOG, low_stock_threshold: 2.5 }).errors.low_stock_threshold,
    'Reorder threshold must be a whole number'
  );
});

test('rejects a negative quantity (UC-1 alternative flow)', () => {
  const result = validateBatch({ ...VALID_BATCH, quantity: -5 });
  assert.equal(result.valid, false);
  assert.equal(result.errors.quantity, 'Quantity cannot be negative');
});

test('rejects a non-integer or non-numeric quantity', () => {
  assert.equal(validateBatch({ ...VALID_BATCH, quantity: 2.5 }).errors.quantity, 'Quantity must be a whole number');
  assert.equal(validateBatch({ ...VALID_BATCH, quantity: 'ten' }).errors.quantity, 'Quantity must be a whole number');
});

test('a stock batch requires both a quantity and its own expiry date', () => {
  const result = validateBatch({});
  assert.equal(result.valid, false);
  assert.ok(result.errors.quantity);
  assert.ok(result.errors.expiry_date);
});

test('rejects an invalid expiry date', () => {
  assert.ok(validateBatch({ ...VALID_BATCH, expiry_date: '2027-02-30' }).errors.expiry_date);
  assert.ok(validateBatch({ ...VALID_BATCH, expiry_date: '30/06/2027' }).errors.expiry_date);
});

test('trims an optional batch number and stores a blank one as null', () => {
  assert.equal(validateBatch({ ...VALID_BATCH, batch_number: ' AMX-2502 ' }).value.batch_number, 'AMX-2502');
  assert.equal(validateBatch(VALID_BATCH).value.batch_number, null);
});

test('rejects an over-long batch number', () => {
  const result = validateBatch({ ...VALID_BATCH, batch_number: 'X'.repeat(61) });
  assert.equal(result.valid, false);
  assert.ok(result.errors.batch_number);
});

test('rejects a negative price', () => {
  assert.equal(
    validateMedication({ ...VALID_CATALOG, unit_price: -1 }).errors.unit_price,
    'Unit price cannot be negative'
  );
});
