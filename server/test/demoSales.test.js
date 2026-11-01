const test = require('node:test');
const assert = require('node:assert/strict');
const demoSales = require('../src/db/demoSales');
const { DEMO_MEDICATIONS, sizeStock } = require('../src/db/demoCatalog');
const { missingRows } = require('../src/services/demoSalesService');

// A tiny stand-in for data/demo-sales.json.
const DATA = { first_day: '2024-02-27', medicines: { Amoxicillin: [3, 4, 5, 6, 7] } };

test('reads a day of sales by calendar date', () => {
  assert.equal(demoSales.unitsOn('Amoxicillin', '2024-02-27', DATA), 3);
  assert.equal(demoSales.unitsOn('Amoxicillin', '2024-03-02', DATA), 7);
});

test('dates outside the data, or an unknown medicine, give null', () => {
  assert.equal(demoSales.unitsOn('Amoxicillin', '2024-02-26', DATA), null);
  assert.equal(demoSales.unitsOn('Amoxicillin', '2024-03-03', DATA), null);
  assert.equal(demoSales.unitsOn('Omeprazole', '2024-02-27', DATA), null);
});

test('counts 29 February in a leap year', () => {
  assert.deepEqual(demoSales.datesBetween('2024-02-28', '2024-03-01'), ['2024-02-28', '2024-02-29', '2024-03-01']);
  assert.equal(demoSales.unitsOn('Amoxicillin', '2024-02-29', DATA), 5);
});

test('recent average covers the days up to and including the last date', () => {
  assert.equal(demoSales.recentAverage('Amoxicillin', '2024-03-02', 2, DATA), 6.5);
});

test('the bundled data covers 2022 to 2029 for every series in the catalog', () => {
  assert.equal(demoSales.firstDay, '2022-01-01');
  assert.equal(demoSales.lastDay, '2029-12-31');
  for (const med of DEMO_MEDICATIONS.filter((m) => m.series)) {
    assert.ok(demoSales.hasSeries(med.series), med.series);
    assert.notEqual(demoSales.unitsOn(med.series, '2029-12-31'), null, med.series);
  }
});

test('stock is sized from demand, lots add up and the threshold is a multiple of 5', () => {
  const amoxicillin = DEMO_MEDICATIONS.find((m) => m.series === 'Amoxicillin');
  const { low_stock_threshold, batches } = sizeStock(amoxicillin, 6);
  assert.equal(batches.reduce((sum, b) => sum + b.quantity, 0), 48); // 8 days x 6
  assert.equal(low_stock_threshold, 20); // 3 days x 6 = 18 -> 20
  assert.ok(batches.every((b) => !('share' in b)));
});

test('a quiet medication still gets a threshold of at least 5', () => {
  const multivitamin = DEMO_MEDICATIONS.find((m) => m.series === 'Multivitamin');
  assert.equal(sizeStock(multivitamin, 0.5).low_stock_threshold, 5);
});

test('top-up fills only the days with no row, up to yesterday', () => {
  const rows = missingRows(9, 'Amoxicillin', ['2024-02-27', '2024-02-29'], '2024-03-01');
  assert.deepEqual(rows, [
    { medication_id: 9, quantity_sold: demoSales.unitsOn('Amoxicillin', '2024-02-28'), date: '2024-02-28' },
    { medication_id: 9, quantity_sold: demoSales.unitsOn('Amoxicillin', '2024-03-01'), date: '2024-03-01' },
  ]);
});

test('top-up leaves a medication with no history alone', () => {
  assert.deepEqual(missingRows(9, 'Amoxicillin', [], '2024-03-01'), []);
});
