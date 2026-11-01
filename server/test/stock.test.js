// Tests for the stock warning flags (FR 4) and FEFO selling (soonest expiry first).
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStockFlags } from '../src/utils/stockFlags.js';
import { allocateUnits, findSellableBatches, countSellableUnits } from '../src/utils/fefo.js';

const TODAY = '2026-09-15';

// ---- stock flags ----

test('flags a quantity below the reorder threshold as low stock (FR 4)', () => {
  const flags = computeStockFlags({ quantity: 9, expiry_date: '2027-01-01', low_stock_threshold: 10 }, TODAY);
  assert.equal(flags.is_low_stock, true);
  assert.equal(flags.is_out_of_stock, false);
  assert.equal(computeStockFlags({ quantity: 10, expiry_date: '2027-01-01', low_stock_threshold: 10 }, TODAY).is_low_stock, false);
});

test('zero units is out of stock (and low stock)', () => {
  const flags = computeStockFlags({ quantity: 0, expiry_date: '2027-01-01' }, TODAY);
  assert.equal(flags.is_out_of_stock, true);
  assert.equal(flags.is_low_stock, true);
});

test("uses the medication's own threshold, or the shared default of 10", () => {
  assert.equal(computeStockFlags({ quantity: 20, low_stock_threshold: 25 }, TODAY).is_low_stock, true);
  assert.equal(computeStockFlags({ quantity: 20, low_stock_threshold: 15 }, TODAY).is_low_stock, false);
  assert.equal(computeStockFlags({ quantity: 9 }, TODAY).low_stock_threshold, 10);
});

test('flags an expiry within 30 days, and an expiry in the past (FR 4)', () => {
  assert.equal(computeStockFlags({ quantity: 50, expiry_date: '2026-10-15' }, TODAY).is_near_expiry, true);
  assert.equal(computeStockFlags({ quantity: 50, expiry_date: '2026-10-16' }, TODAY).is_near_expiry, false);
  assert.equal(computeStockFlags({ quantity: 50, expiry_date: '2026-10-15' }, TODAY).days_until_expiry, 30);
  assert.equal(computeStockFlags({ quantity: 50, expiry_date: '2026-09-01' }, TODAY).is_expired, true);
});

test('a medication with no sellable lot has no expiry warning', () => {
  const flags = computeStockFlags({ quantity: 0, expiry_date: null }, TODAY);
  assert.equal(flags.days_until_expiry, null);
  assert.equal(flags.is_near_expiry, false);
  assert.equal(flags.is_expired, false);
});

// ---- FEFO ----

// 45 sellable units in two lots, plus one lot that expired ten days ago
const BATCHES = [
  { id: 1, quantity: 25, expiry_date: '2027-04-14' },
  { id: 2, quantity: 20, expiry_date: '2026-10-11' },
  { id: 3, quantity: 12, expiry_date: '2026-09-05' },
];

test('takes from the soonest-expiring lot first (FEFO)', () => {
  const { allocations, shortfall } = allocateUnits(BATCHES, 5, TODAY);
  assert.equal(shortfall, 0);
  assert.deepEqual(allocations, [{ batch_id: 2, take: 5, expiry_date: '2026-10-11', remaining_after: 15 }]);
});

test('moves on to the next lot when the first runs out', () => {
  const { allocations } = allocateUnits(BATCHES, 30, TODAY);
  assert.deepEqual(
    allocations.map((allocation) => [allocation.batch_id, allocation.take, allocation.remaining_after]),
    [
      [2, 20, 0],
      [1, 10, 15],
    ]
  );
});

test('never sells an expired lot', () => {
  assert.deepEqual(
    findSellableBatches(BATCHES, TODAY).map((batch) => batch.id),
    [2, 1]
  );
  assert.equal(countSellableUnits(BATCHES, TODAY), 45);
});

test('reports how many units are missing when there is not enough stock', () => {
  const { allocations, shortfall } = allocateUnits(BATCHES, 60, TODAY);
  assert.equal(shortfall, 15);
  assert.equal(allocations[0].take + allocations[1].take, 45);
});

test('skips empty lots and still sells a lot that expires today', () => {
  const batches = [
    { id: 10, quantity: 0, expiry_date: '2026-09-20' },
    { id: 11, quantity: 8, expiry_date: TODAY },
  ];
  const { allocations, shortfall } = allocateUnits(batches, 8, TODAY);
  assert.equal(shortfall, 0);
  assert.deepEqual(
    allocations.map((allocation) => allocation.batch_id),
    [11]
  );
});
