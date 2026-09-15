const test = require('node:test');
const assert = require('node:assert/strict');
const { computeStockFlags } = require('../src/utils/stockFlags');

const today = new Date('2026-09-15T12:00:00Z');

test('flags quantity below the low-stock threshold (FR 4)', () => {
  const flags = computeStockFlags({ quantity: 9, expiry_date: '2027-01-01' }, { today, lowStockThreshold: 10 });
  assert.equal(flags.is_low_stock, true);
  assert.equal(flags.is_out_of_stock, false);
});

test('does not flag quantity at or above the threshold', () => {
  const flags = computeStockFlags({ quantity: 10, expiry_date: '2027-01-01' }, { today, lowStockThreshold: 10 });
  assert.equal(flags.is_low_stock, false);
});

test('flags zero quantity as out of stock and low stock', () => {
  const flags = computeStockFlags({ quantity: 0, expiry_date: '2027-01-01' }, { today });
  assert.equal(flags.is_out_of_stock, true);
  assert.equal(flags.is_low_stock, true);
});

test('flags expiry within 30 days (FR 4)', () => {
  assert.equal(computeStockFlags({ quantity: 50, expiry_date: '2026-10-15' }, { today }).is_near_expiry, true);
  assert.equal(computeStockFlags({ quantity: 50, expiry_date: '2026-10-16' }, { today }).is_near_expiry, false);
  assert.equal(computeStockFlags({ quantity: 50, expiry_date: '2026-10-15' }, { today }).days_until_expiry, 30);
});

test('marks already expired items', () => {
  const flags = computeStockFlags({ quantity: 50, expiry_date: '2026-09-01' }, { today });
  assert.equal(flags.is_expired, true);
  assert.equal(flags.is_near_expiry, true);
});
