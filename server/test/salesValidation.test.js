const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSale, validateSaleItem } = require('../src/validation/salesValidation');

test('accepts a basket of several medications and coerces the values', () => {
  const result = validateSale({
    items: [
      { medication_id: 3, quantity: '2' },
      { medication_id: '9', quantity: 1 },
    ],
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.value.items, [
    { medication_id: 3, quantity: 2 },
    { medication_id: 9, quantity: 1 },
  ]);
});

test('merges a medication that appears twice into a single line', () => {
  const result = validateSale({
    items: [
      { medication_id: 3, quantity: 2 },
      { medication_id: 3, quantity: 5 },
    ],
  });
  assert.equal(result.value.items.length, 1);
  assert.deepEqual(result.value.items[0], { medication_id: 3, quantity: 7 });
});

test('orders lines by medication id so concurrent sales lock in the same order', () => {
  const result = validateSale({
    items: [
      { medication_id: 9, quantity: 1 },
      { medication_id: 2, quantity: 1 },
      { medication_id: 5, quantity: 1 },
    ],
  });
  assert.deepEqual(
    result.value.items.map((item) => item.medication_id),
    [2, 5, 9]
  );
});

test('rejects an empty basket', () => {
  assert.equal(validateSale({}).valid, false);
  assert.equal(validateSale({ items: [] }).errors.items, 'Add at least one medication to the sale');
});

test('reports which line of the basket is invalid', () => {
  const result = validateSale({
    items: [
      { medication_id: 3, quantity: 1 },
      { medication_id: 3, quantity: 0 },
    ],
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.items, /Line 2/);
});

test('a line needs a medication and a positive whole quantity', () => {
  assert.equal(validateSaleItem({ quantity: 1 }).errors.medication_id, 'Select a medication');
  assert.equal(validateSaleItem({ medication_id: 3 }).errors.quantity, 'Quantity is required');
  assert.equal(validateSaleItem({ medication_id: 3, quantity: 0 }).errors.quantity, 'Quantity must be at least 1');
  assert.equal(validateSaleItem({ medication_id: 3, quantity: -2 }).errors.quantity, 'Quantity must be at least 1');
  assert.equal(
    validateSaleItem({ medication_id: 3, quantity: 1.5 }).errors.quantity,
    'Quantity must be a whole number'
  );
});
