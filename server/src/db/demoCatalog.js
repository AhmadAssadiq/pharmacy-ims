// The demo pharmacy's starting catalogue (used by db/seed.js and services/demoSalesService.js).
//
// Ten medications have a `series`: the name of their daily sales in data/demo-sales.json,
// which the seed copies into sales_history from 2022 up to yesterday (see db/demoSales.js).
// Their stock is not a fixed number: it is worked out from their recent demand when the
// seed runs (sizeStock below), so the demo shows the same situations whenever it is seeded:
//   stock.coverDays   - how many days of average demand are in stock
//   stock.reorderDays - how many days of average demand the reorder threshold is
//   batches[].share   - which part of the stock is in this lot (0.45 = 45%)
//
// Vitamin D3 has no series: it was "just stocked" and gets only 5 days of made-up sales,
// to show the "not enough data to forecast" case (UC-3 alternative flow).
import { addDaysToDate, todayAsText } from '../utils/dates.js';

// The date `days` days from today, as 'YYYY-MM-DD' (negative = in the past).
function daysFromToday(days) {
  return addDaysToDate(todayAsText(), days);
}

export const DEMO_MEDICATIONS = [
  {
    name: 'Paracetamol 500mg', category: 'Analgesic', unit_price: 1.5,
    supplier_info: 'Hikma Pharmaceuticals - +962 6 580 2900',
    series: 'Paracetamol',
    stock: { coverDays: 30, reorderDays: 4 },
    batches: [
      { share: 0.45, expiry_date: daysFromToday(120), batch_number: 'PARA-2409', received_date: daysFromToday(-80) },
      { share: 0.55, expiry_date: daysFromToday(400), batch_number: 'PARA-2511', received_date: daysFromToday(-20) },
    ],
  },
  {
    name: 'Ibuprofen 400mg', category: 'Analgesic', unit_price: 2.25,
    supplier_info: 'Dar Al Dawa - orders@dad.jo',
    series: 'Ibuprofen',
    stock: { coverDays: 35, reorderDays: 3 },
    batches: [
      { share: 1, expiry_date: daysFromToday(300), batch_number: 'IBU-2503', received_date: daysFromToday(-45) },
    ],
  },
  {
    // A week's stock split over two lots -> alert expected, and the short-dated
    // lot is the one FEFO drains first.
    name: 'Amoxicillin 500mg', category: 'Antibiotic', unit_price: 4.8,
    supplier_info: 'Hikma Pharmaceuticals - +962 6 580 2900',
    series: 'Amoxicillin',
    stock: { coverDays: 8, reorderDays: 3 },
    batches: [
      { share: 0.45, expiry_date: daysFromToday(25), batch_number: 'AMX-2408', received_date: daysFromToday(-90) },
      { share: 0.55, expiry_date: daysFromToday(210), batch_number: 'AMX-2502', received_date: daysFromToday(-15) },
    ],
  },
  {
    name: 'Azithromycin 250mg', category: 'Antibiotic', unit_price: 6.5,
    supplier_info: 'JOSWE Medical - sales@joswe.com',
    series: 'Azithromycin',
    stock: { coverDays: 25, reorderDays: 4 },
    batches: [
      { share: 1, expiry_date: daysFromToday(150), batch_number: 'AZI-2501', received_date: daysFromToday(-30) },
    ],
  },
  {
    name: 'Metformin 850mg', category: 'Antidiabetic', unit_price: 3.1,
    supplier_info: 'Dar Al Dawa - orders@dad.jo',
    series: 'Metformin',
    stock: { coverDays: 45, reorderDays: 7 },
    batches: [
      { share: 1, expiry_date: daysFromToday(500), batch_number: 'MET-2512', received_date: daysFromToday(-10) },
    ],
  },
  {
    // One lot expires within the 30-day window -> near-expiry flag (FR 4).
    name: 'Amlodipine 5mg', category: 'Antihypertensive', unit_price: 2.9,
    supplier_info: 'Pharma International - +962 6 402 1000',
    series: 'Amlodipine',
    stock: { coverDays: 30, reorderDays: 5 },
    batches: [
      { share: 0.4, expiry_date: daysFromToday(20), batch_number: 'AML-2407', received_date: daysFromToday(-120) },
      { share: 0.6, expiry_date: daysFromToday(300), batch_number: 'AML-2504', received_date: daysFromToday(-25) },
    ],
  },
  {
    name: 'Cetirizine 10mg', category: 'Antihistamine', unit_price: 1.2,
    supplier_info: 'Hikma Pharmaceuticals - +962 6 580 2900',
    series: 'Cetirizine',
    stock: { coverDays: 40, reorderDays: 4 },
    batches: [
      { share: 1, expiry_date: daysFromToday(365), batch_number: 'CET-2506', received_date: daysFromToday(-35) },
    ],
  },
  {
    // Strongly seasonal and only a few days in stock -> in autumn and winter the
    // rising demand brings the alert forward.
    name: 'Cough Syrup 100ml', category: 'Respiratory', unit_price: 3.25,
    supplier_info: 'Pharma International - +962 6 402 1000',
    series: 'Cough Syrup',
    stock: { coverDays: 6, reorderDays: 3 },
    batches: [
      { share: 1, expiry_date: daysFromToday(300), batch_number: 'CSY-2505', received_date: daysFromToday(-40) },
    ],
  },
  {
    name: 'Vitamin C 1000mg', category: 'Supplement', unit_price: 4.5,
    supplier_info: 'Dar Al Dawa - orders@dad.jo',
    series: 'Vitamin C',
    stock: { coverDays: 30, reorderDays: 4 },
    batches: [
      { share: 1, expiry_date: daysFromToday(250), batch_number: 'VITC-2504', received_date: daysFromToday(-30) },
    ],
  },
  {
    // Everything on hand has already expired: nothing sellable, nothing
    // dispensable, and the expired units stay visible so staff can clear them.
    name: 'Multivitamin Tablets', category: 'Supplement', unit_price: 7.0,
    supplier_info: 'JOSWE Medical - sales@joswe.com',
    series: 'Multivitamin',
    stock: { coverDays: 12, reorderDays: 4 },
    batches: [
      { share: 1, expiry_date: daysFromToday(-10), batch_number: 'MVT-2312', received_date: daysFromToday(-200) },
    ],
  },
  {
    // Newly stocked item with only a few days of sales -> insufficient data, no
    // alert (UC-3 alternative flow).
    name: 'Vitamin D3 1000IU', category: 'Supplement', unit_price: 5.5,
    supplier_info: 'Dar Al Dawa - orders@dad.jo',
    low_stock_threshold: 30,
    batches: [
      { quantity: 200, expiry_date: daysFromToday(600), batch_number: 'VITD-2601', received_date: daysFromToday(-5) },
    ],
    demand: { avgDaily: 4, trend: 0, days: 5 },
  },
];

// The demo-sales.json series of a catalogue medication (e.g. 'Amoxicillin 500mg' -> 'Amoxicillin'),
// or null for a medication that is not in the demo catalogue.
export function findDemoSeries(medicationName) {
  for (const medication of DEMO_MEDICATIONS) {
    if (medication.name === medicationName && medication.series) {
      return medication.series;
    }
  }
  return null;
}

// Works out the reorder threshold and the quantity of each lot from the medication's
// average daily demand. Example for Amoxicillin (8 days of stock, threshold 3 days)
// selling 6 a day: 48 units in total and a threshold of 18, rounded to 20.
//   - the threshold is rounded to a multiple of 5, and is at least 5;
//   - each lot gets its share of the total; the last lot takes what rounding left over.
export function sizeStock(medication, averageDaily) {
  const totalUnits = Math.max(Math.round(averageDaily * medication.stock.coverDays), medication.batches.length);
  const threshold = Math.max(5, Math.round((averageDaily * medication.stock.reorderDays) / 5) * 5);

  const batches = [];
  let unitsLeft = totalUnits;
  medication.batches.forEach((batch, index) => {
    const isLastBatch = index === medication.batches.length - 1;
    const quantity = isLastBatch ? unitsLeft : Math.max(1, Math.round(totalUnits * batch.share));
    unitsLeft -= quantity;
    batches.push({
      expiry_date: batch.expiry_date,
      batch_number: batch.batch_number,
      received_date: batch.received_date,
      quantity,
    });
  });

  return { low_stock_threshold: threshold, batches };
}
