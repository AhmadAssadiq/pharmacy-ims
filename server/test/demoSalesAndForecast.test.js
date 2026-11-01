// Tests for the demo sales data (GP2 addition) and the forecast that runs soon after a sale.
import test from 'node:test';
import assert from 'node:assert/strict';
import demoSalesData from '../../data/demo-sales.json' with { type: 'json' };
import { db } from '../src/db.js';
import { DEMO_FIRST_DAY, DEMO_LAST_DAY, hasDemoSeries, getDemoUnits, getRecentAverage } from '../src/db/demoSales.js';
import { DEMO_MEDICATIONS, findDemoSeries, sizeStock } from '../src/db/demoCatalog.js';
import { findMissingDays } from '../src/services/demoSalesService.js';
import { listDatesBetween } from '../src/utils/dates.js';
import { requestForecastSoon } from '../src/jobs/forecastJob.js';

// ---- demo sales data ----

test('the data covers 2022 to 2029 for every medication in the demo catalogue', () => {
  assert.equal(DEMO_FIRST_DAY, '2022-01-01');
  assert.equal(DEMO_LAST_DAY, '2029-12-31');
  for (const medication of DEMO_MEDICATIONS) {
    if (medication.series) {
      assert.ok(hasDemoSeries(medication.series), medication.series);
      assert.notEqual(getDemoUnits(medication.series, '2029-12-31'), null, medication.series);
    }
  }
});

test('reads a day of sales by its calendar date', () => {
  const amoxicillin = demoSalesData.medicines.Amoxicillin;
  assert.equal(getDemoUnits('Amoxicillin', '2022-01-01'), amoxicillin[0]);
  assert.equal(getDemoUnits('Amoxicillin', '2022-01-31'), amoxicillin[30]);
  assert.equal(getDemoUnits('Amoxicillin', '2024-02-29'), amoxicillin[789]); // a leap day counts
});

test('dates outside the data, or an unknown medicine, give null', () => {
  assert.equal(getDemoUnits('Amoxicillin', '2021-12-31'), null);
  assert.equal(getDemoUnits('Amoxicillin', '2030-01-01'), null);
  assert.equal(getDemoUnits('Omeprazole', '2024-01-01'), null);
});

test('the recent average covers the days up to and including the last date', () => {
  const amoxicillin = demoSalesData.medicines.Amoxicillin;
  assert.equal(getRecentAverage('Amoxicillin', '2022-01-02', 2), (amoxicillin[0] + amoxicillin[1]) / 2);
});

test('the catalogue maps its medications to their data series', () => {
  assert.equal(findDemoSeries('Amoxicillin 500mg'), 'Amoxicillin');
  assert.equal(findDemoSeries('Vitamin D3 1000IU'), null); // newly stocked, no history
  assert.equal(findDemoSeries('Something staff added'), null);
});

test('stock is sized from demand: lots add up and the threshold is a multiple of 5', () => {
  const amoxicillin = DEMO_MEDICATIONS.find((medication) => medication.series === 'Amoxicillin');
  const { low_stock_threshold, batches } = sizeStock(amoxicillin, 6);
  assert.equal(batches[0].quantity + batches[1].quantity, 48); // 8 days x 6 a day
  assert.equal(low_stock_threshold, 20); // 3 days x 6 = 18, rounded to 20

  const multivitamin = DEMO_MEDICATIONS.find((medication) => medication.series === 'Multivitamin');
  assert.equal(sizeStock(multivitamin, 0.5).low_stock_threshold, 5); // never below 5
});

test('the top-up fills only days with no row, up to yesterday', () => {
  const rows = findMissingDays(9, 'Amoxicillin', ['2024-02-27', '2024-02-29'], '2024-03-01');
  assert.deepEqual(rows, [
    { medication_id: 9, quantity_sold: getDemoUnits('Amoxicillin', '2024-02-28'), date: '2024-02-28' },
    { medication_id: 9, quantity_sold: getDemoUnits('Amoxicillin', '2024-03-01'), date: '2024-03-01' },
  ]);
  // A medication that was never seeded is left alone
  assert.deepEqual(findMissingDays(9, 'Amoxicillin', [], '2024-03-01'), []);
});

test('listDatesBetween includes both ends and 29 February', () => {
  assert.deepEqual(listDatesBetween('2024-02-28', '2024-03-01'), ['2024-02-28', '2024-02-29', '2024-03-01']);
});

// ---- forecast after a sale ----

test('several sales close together cause ONE forecast run, 10 seconds later', async (t) => {
  // Fake database (no medications) and fake ML service, counting the calls to it
  t.mock.method(db, 'query', async () => [[]]);
  const mlCalls = t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ results: [] }) }));
  t.mock.method(console, 'log', () => {});
  t.mock.timers.enable({ apis: ['setTimeout'] });

  requestForecastSoon();
  requestForecastSoon();
  requestForecastSoon();

  // Nothing yet: the run waits 10 seconds
  t.mock.timers.tick(9999);
  assert.equal(mlCalls.mock.callCount(), 0);

  // After 10 seconds: one run = one /train call and one /predict call
  t.mock.timers.tick(1);
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(mlCalls.mock.callCount(), 2);
});
