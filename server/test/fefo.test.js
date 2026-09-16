const test = require('node:test');
const assert = require('node:assert/strict');
const { allocate, sellableBatches, sellableQuantity } = require('../src/utils/fefo');

const today = new Date('2026-09-16T12:00:00Z');

// 45 sellable units across two lots, plus one lot that expired ten days ago.
const BATCHES = [
  { id: 1, quantity: 25, expiry_date: '2027-04-14' },
  { id: 2, quantity: 20, expiry_date: '2026-10-11' },
  { id: 3, quantity: 12, expiry_date: '2026-09-06' },
];

test('draws from the nearest expiry first (FEFO)', () => {
  const { allocations, shortfall } = allocate(BATCHES, 5, { today });
  assert.equal(shortfall, 0);
  assert.deepEqual(
    allocations.map((a) => a.batch_id),
    [2]
  );
  assert.equal(allocations[0].take, 5);
  assert.equal(allocations[0].remaining_after, 15);
});

test('spills into the next lot once the nearest is exhausted', () => {
  const { allocations, shortfall } = allocate(BATCHES, 30, { today });
  assert.equal(shortfall, 0);
  assert.deepEqual(
    allocations.map((a) => [a.batch_id, a.take]),
    [
      [2, 20],
      [1, 10],
    ]
  );
  assert.equal(allocations[0].remaining_after, 0);
  assert.equal(allocations[1].remaining_after, 15);
});

test('never dispenses expired stock', () => {
  assert.deepEqual(
    sellableBatches(BATCHES, today).map((b) => b.id),
    [2, 1]
  );
  assert.equal(sellableQuantity(BATCHES, today), 45);
  const { allocations } = allocate(BATCHES, 45, { today });
  assert.ok(allocations.every((a) => a.batch_id !== 3));
});

test('an exact fit empties every lot it touches', () => {
  const { allocations, shortfall } = allocate(BATCHES, 45, { today });
  assert.equal(shortfall, 0);
  assert.ok(allocations.every((a) => a.remaining_after === 0));
});

test('reports the shortfall when stock is insufficient', () => {
  const { allocations, shortfall } = allocate(BATCHES, 60, { today });
  assert.equal(shortfall, 15);
  assert.equal(
    allocations.reduce((sum, a) => sum + a.take, 0),
    45
  );
});

test('skips empty lots and still dispenses a lot expiring today', () => {
  const batches = [
    { id: 10, quantity: 0, expiry_date: '2026-09-20' },
    { id: 11, quantity: 8, expiry_date: '2026-09-16' },
  ];
  const { allocations, shortfall } = allocate(batches, 8, { today });
  assert.equal(shortfall, 0);
  assert.deepEqual(
    allocations.map((a) => a.batch_id),
    [11]
  );
});

test('allocates nothing when there is no sellable stock', () => {
  const { allocations, shortfall } = allocate([{ id: 3, quantity: 12, expiry_date: '2026-09-06' }], 5, { today });
  assert.deepEqual(allocations, []);
  assert.equal(shortfall, 5);
});
