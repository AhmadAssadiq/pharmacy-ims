/**
 * The demo catalog (used by db/seed.js and services/demoSalesService.js).
 *
 * Ten medications have a `series` in data/demo-sales.json, which supplies their
 * daily sales from 2022 to yesterday (see db/demoSales.js). Their stock is
 * sized from that demand when the seed runs, so the demo shows the same
 * situations whenever it is seeded - including in a busy winter month:
 *   stock.coverDays   - days of recent average demand held in stock
 *   stock.reorderDays - days of recent average demand used as the reorder threshold
 *   batches[].share   - this lot's part of the stock
 *
 * Vitamin D3 has no series: it is newly stocked, with a few days of generated
 * sales (`demand`), to show the "insufficient data" path (UC-3 alternative flow).
 */

/** Returns a YYYY-MM-DD date `days` days from today (negative = in the past). */
function dateFromToday(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const DEMO_MEDICATIONS = [
  {
    name: 'Paracetamol 500mg', category: 'Analgesic', unit_price: 1.5,
    supplier_info: 'Hikma Pharmaceuticals - +962 6 580 2900',
    series: 'Paracetamol',
    stock: { coverDays: 30, reorderDays: 4 },
    batches: [
      { share: 0.45, expiry_date: dateFromToday(120), batch_number: 'PARA-2409', received_date: dateFromToday(-80) },
      { share: 0.55, expiry_date: dateFromToday(400), batch_number: 'PARA-2511', received_date: dateFromToday(-20) },
    ],
  },
  {
    name: 'Ibuprofen 400mg', category: 'Analgesic', unit_price: 2.25,
    supplier_info: 'Dar Al Dawa - orders@dad.jo',
    series: 'Ibuprofen',
    stock: { coverDays: 35, reorderDays: 3 },
    batches: [
      { share: 1, expiry_date: dateFromToday(300), batch_number: 'IBU-2503', received_date: dateFromToday(-45) },
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
      { share: 0.45, expiry_date: dateFromToday(25), batch_number: 'AMX-2408', received_date: dateFromToday(-90) },
      { share: 0.55, expiry_date: dateFromToday(210), batch_number: 'AMX-2502', received_date: dateFromToday(-15) },
    ],
  },
  {
    name: 'Azithromycin 250mg', category: 'Antibiotic', unit_price: 6.5,
    supplier_info: 'JOSWE Medical - sales@joswe.com',
    series: 'Azithromycin',
    stock: { coverDays: 25, reorderDays: 4 },
    batches: [
      { share: 1, expiry_date: dateFromToday(150), batch_number: 'AZI-2501', received_date: dateFromToday(-30) },
    ],
  },
  {
    name: 'Metformin 850mg', category: 'Antidiabetic', unit_price: 3.1,
    supplier_info: 'Dar Al Dawa - orders@dad.jo',
    series: 'Metformin',
    stock: { coverDays: 45, reorderDays: 7 },
    batches: [
      { share: 1, expiry_date: dateFromToday(500), batch_number: 'MET-2512', received_date: dateFromToday(-10) },
    ],
  },
  {
    // One lot expires within the 30-day window -> near-expiry flag (FR 4).
    name: 'Amlodipine 5mg', category: 'Antihypertensive', unit_price: 2.9,
    supplier_info: 'Pharma International - +962 6 402 1000',
    series: 'Amlodipine',
    stock: { coverDays: 30, reorderDays: 5 },
    batches: [
      { share: 0.4, expiry_date: dateFromToday(20), batch_number: 'AML-2407', received_date: dateFromToday(-120) },
      { share: 0.6, expiry_date: dateFromToday(300), batch_number: 'AML-2504', received_date: dateFromToday(-25) },
    ],
  },
  {
    name: 'Cetirizine 10mg', category: 'Antihistamine', unit_price: 1.2,
    supplier_info: 'Hikma Pharmaceuticals - +962 6 580 2900',
    series: 'Cetirizine',
    stock: { coverDays: 40, reorderDays: 4 },
    batches: [
      { share: 1, expiry_date: dateFromToday(365), batch_number: 'CET-2506', received_date: dateFromToday(-35) },
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
      { share: 1, expiry_date: dateFromToday(300), batch_number: 'CSY-2505', received_date: dateFromToday(-40) },
    ],
  },
  {
    name: 'Vitamin C 1000mg', category: 'Supplement', unit_price: 4.5,
    supplier_info: 'Dar Al Dawa - orders@dad.jo',
    series: 'Vitamin C',
    stock: { coverDays: 30, reorderDays: 4 },
    batches: [
      { share: 1, expiry_date: dateFromToday(250), batch_number: 'VITC-2504', received_date: dateFromToday(-30) },
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
      { share: 1, expiry_date: dateFromToday(-10), batch_number: 'MVT-2312', received_date: dateFromToday(-200) },
    ],
  },
  {
    // Newly stocked item with only a few days of sales -> insufficient data, no
    // alert (UC-3 alternative flow).
    name: 'Vitamin D3 1000IU', category: 'Supplement', unit_price: 5.5,
    supplier_info: 'Dar Al Dawa - orders@dad.jo',
    low_stock_threshold: 30,
    batches: [
      { quantity: 200, expiry_date: dateFromToday(600), batch_number: 'VITD-2601', received_date: dateFromToday(-5) },
    ],
    demand: { avgDaily: 4, trend: 0, days: 5 },
  },
];

/** The demo-sales.json series behind a catalog name, or null. */
function seriesFor(medicationName) {
  const entry = DEMO_MEDICATIONS.find((med) => med.name === medicationName);
  return entry?.series || null;
}

/**
 * Threshold and lot quantities for a series-backed entry, given its recent
 * average daily demand. The threshold is rounded to a multiple of 5 (at least
 * 5), and the last lot takes whatever rounding left over.
 */
function sizeStock({ stock, batches }, averageDaily) {
  const total = Math.max(Math.round(averageDaily * stock.coverDays), batches.length);
  const threshold = Math.max(5, Math.round((averageDaily * stock.reorderDays) / 5) * 5);
  let left = total;
  const sized = batches.map(({ share, ...batch }, index) => {
    const quantity = index === batches.length - 1 ? left : Math.max(1, Math.round(total * share));
    left -= quantity;
    return { ...batch, quantity };
  });
  return { low_stock_threshold: threshold, batches: sized };
}

module.exports = { DEMO_MEDICATIONS, seriesFor, sizeStock, dateFromToday };
