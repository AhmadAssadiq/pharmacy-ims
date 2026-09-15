const test = require('node:test');
const assert = require('node:assert/strict');
const { validateMedication, validateQuantityUpdate } = require('../src/validation/medicationValidation');

const VALID = {
  name: 'Paracetamol 500mg',
  category: 'Analgesic',
  quantity: '120',
  unit_price: '1.5',
  expiry_date: '2027-06-30',
  supplier_info: 'Hikma Pharmaceuticals',
};

test('accepts a complete medication and coerces numeric fields', () => {
  const result = validateMedication(VALID);
  assert.equal(result.valid, true);
  assert.equal(result.value.quantity, 120);
  assert.equal(result.value.unit_price, 1.5);
  assert.equal(result.value.expiry_date, '2027-06-30');
});

test('rejects a negative quantity (UC-1 alternative flow)', () => {
  const result = validateMedication({ ...VALID, quantity: -5 });
  assert.equal(result.valid, false);
  assert.equal(result.errors.quantity, 'Quantity cannot be negative');
});

test('rejects a non-integer or non-numeric quantity', () => {
  assert.equal(validateMedication({ ...VALID, quantity: 2.5 }).errors.quantity, 'Quantity must be a whole number');
  assert.equal(validateMedication({ ...VALID, quantity: 'ten' }).errors.quantity, 'Quantity must be a whole number');
});

test('requires every field from FR 3.1', () => {
  const result = validateMedication({});
  assert.equal(result.valid, false);
  for (const field of ['name', 'category', 'quantity', 'unit_price', 'expiry_date', 'supplier_info']) {
    assert.ok(result.errors[field], `${field} should be reported`);
  }
});

test('rejects an invalid expiry date', () => {
  assert.ok(validateMedication({ ...VALID, expiry_date: '2027-02-30' }).errors.expiry_date);
  assert.ok(validateMedication({ ...VALID, expiry_date: '30/06/2027' }).errors.expiry_date);
});

test('rejects a negative price', () => {
  assert.equal(validateMedication({ ...VALID, unit_price: -1 }).errors.unit_price, 'Unit price cannot be negative');
});

test('quantity-only update rejects negative and accepts zero', () => {
  assert.equal(validateQuantityUpdate({ quantity: -1 }).valid, false);
  assert.equal(validateQuantityUpdate({ quantity: 0 }).valid, true);
  assert.equal(validateQuantityUpdate({ quantity: '42' }).value.quantity, 42);
});
