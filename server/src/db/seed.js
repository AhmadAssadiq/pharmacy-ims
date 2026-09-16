/**
 * Seeds the database with demo accounts, a starter medication catalog (held as
 * dated stock batches) and synthetic historical sales for the forecasting model.
 *
 * Safe to run repeatedly: existing accounts are kept, medications are only
 * inserted when the catalog is empty, and only the synthetic sales backfill is
 * regenerated - real sales recorded through the dispensing flow are preserved.
 *
 * Usage: npm run db:seed
 *
 * Demo accounts (password in brackets):
 *   staff@pharmacy.com   (Staff123!)   - role: staff
 *   patient@example.com  (Patient123!) - role: patient
 */
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const userModel = require('../models/userModel');
const medicationModel = require('../models/medicationModel');
const medicationBatchModel = require('../models/medicationBatchModel');
const salesHistoryModel = require('../models/salesHistoryModel');
const { ROLES } = require('../../../shared/constants.json');

const DEMO_USERS = [
  { name: 'Pharmacy Staff', email: 'staff@pharmacy.com', password: 'Staff123!', role: ROLES.STAFF },
  { name: 'Demo Patient', email: 'patient@example.com', password: 'Patient123!', role: ROLES.PATIENT },
];

/** Returns a YYYY-MM-DD date `days` days from today (negative = in the past). */
function dateFromToday(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Catalog entries. `batches` are the stock lots the medication is held in - each
 * with its own expiry date, so the near-expiry flag and FEFO dispensing have
 * something realistic to work with. `demand` drives the synthetic sales history:
 *   avgDaily  - average units sold per day
 *   trend     - change in daily demand over the whole history window
 *   days      - how many days of history to generate (short = insufficient data)
 */
const DEMO_MEDICATIONS = [
  {
    name: 'Paracetamol 500mg', category: 'Analgesic', unit_price: 1.5,
    supplier_info: 'Hikma Pharmaceuticals - +962 6 580 2900',
    low_stock_threshold: 25, // fast mover: reorder earlier than the default
    batches: [
      { quantity: 60, expiry_date: dateFromToday(120), batch_number: 'PARA-2409', received_date: dateFromToday(-80) },
      { quantity: 70, expiry_date: dateFromToday(400), batch_number: 'PARA-2511', received_date: dateFromToday(-20) },
    ],
    demand: { avgDaily: 5, trend: 0, days: 90 },
  },
  {
    name: 'Ibuprofen 400mg', category: 'Analgesic', unit_price: 2.25,
    supplier_info: 'Dar Al Dawa - orders@dad.jo',
    low_stock_threshold: 10,
    batches: [
      { quantity: 80, expiry_date: dateFromToday(300), batch_number: 'IBU-2503', received_date: dateFromToday(-45) },
    ],
    demand: { avgDaily: 3, trend: 0, days: 90 },
  },
  {
    // Rising demand against modest stock split over two lots -> alert expected,
    // and the short-dated lot is the one FEFO drains first.
    name: 'Amoxicillin 500mg', category: 'Antibiotic', unit_price: 4.8,
    supplier_info: 'Hikma Pharmaceuticals - +962 6 580 2900',
    low_stock_threshold: 15,
    batches: [
      { quantity: 20, expiry_date: dateFromToday(25), batch_number: 'AMX-2408', received_date: dateFromToday(-90) },
      { quantity: 25, expiry_date: dateFromToday(210), batch_number: 'AMX-2502', received_date: dateFromToday(-15) },
    ],
    demand: { avgDaily: 6, trend: 3, days: 90 },
  },
  {
    name: 'Azithromycin 250mg', category: 'Antibiotic', unit_price: 6.5,
    supplier_info: 'JOSWE Medical - sales@joswe.com',
    low_stock_threshold: 10,
    batches: [
      { quantity: 25, expiry_date: dateFromToday(150), batch_number: 'AZI-2501', received_date: dateFromToday(-30) },
    ],
    demand: { avgDaily: 1, trend: 0, days: 90 },
  },
  {
    name: 'Metformin 850mg', category: 'Antidiabetic', unit_price: 3.1,
    supplier_info: 'Dar Al Dawa - orders@dad.jo',
    low_stock_threshold: 20,
    batches: [
      { quantity: 60, expiry_date: dateFromToday(500), batch_number: 'MET-2512', received_date: dateFromToday(-10) },
    ],
    demand: { avgDaily: 2, trend: 0, days: 90 },
  },
  {
    // One lot expires within the 30-day window -> near-expiry flag (FR 4).
    name: 'Amlodipine 5mg', category: 'Antihypertensive', unit_price: 2.9,
    supplier_info: 'Pharma International - +962 6 402 1000',
    low_stock_threshold: 10,
    batches: [
      { quantity: 15, expiry_date: dateFromToday(20), batch_number: 'AML-2407', received_date: dateFromToday(-120) },
      { quantity: 20, expiry_date: dateFromToday(300), batch_number: 'AML-2504', received_date: dateFromToday(-25) },
    ],
    demand: { avgDaily: 1, trend: 0, days: 90 },
  },
  {
    // Everything on hand has already expired: nothing sellable, nothing
    // dispensable, and the expired units stay visible so staff can clear them.
    name: 'Omeprazole 20mg', category: 'Antacid', unit_price: 3.75,
    supplier_info: 'JOSWE Medical - sales@joswe.com',
    low_stock_threshold: 10,
    batches: [
      { quantity: 12, expiry_date: dateFromToday(-10), batch_number: 'OME-2312', received_date: dateFromToday(-200) },
    ],
    demand: { avgDaily: 2, trend: 0, days: 60 },
  },
  {
    name: 'Cetirizine 10mg', category: 'Antihistamine', unit_price: 1.2,
    supplier_info: 'Hikma Pharmaceuticals - +962 6 580 2900',
    low_stock_threshold: 10,
    batches: [
      { quantity: 90, expiry_date: dateFromToday(365), batch_number: 'CET-2506', received_date: dateFromToday(-35) },
    ],
    demand: { avgDaily: 2, trend: 0, days: 90 },
  },
  {
    // Small stock with steady demand -> alert expected within a few days.
    name: 'Salbutamol Inhaler', category: 'Respiratory', unit_price: 8.0,
    supplier_info: 'Pharma International - +962 6 402 1000',
    low_stock_threshold: 10,
    batches: [
      { quantity: 15, expiry_date: dateFromToday(180), batch_number: 'SAL-2505', received_date: dateFromToday(-40) },
    ],
    demand: { avgDaily: 1.5, trend: 0, days: 90 },
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

/** Small deterministic pseudo-random generator so the seed is reproducible. */
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Generates daily sales rows for one medication ending yesterday. */
function generateSales(medicationId, { avgDaily, trend, days }) {
  const random = createRandom(medicationId * 7919);
  const rows = [];
  for (let i = 0; i < days; i += 1) {
    const dayOffset = days - i; // days ago (ends yesterday)
    const progress = i / Math.max(days - 1, 1);
    const date = new Date();
    date.setDate(date.getDate() - dayOffset);
    const weekday = date.getDay();
    const weekendFactor = weekday === 5 ? 0.6 : weekday === 6 ? 0.8 : 1; // Fri/Sat quieter
    const expected = (avgDaily - trend / 2 + trend * progress) * weekendFactor;
    const noise = (random() - 0.5) * avgDaily; // +/- half the average
    const quantity = Math.max(0, Math.round(expected + noise));
    rows.push({ medication_id: medicationId, quantity_sold: quantity, date: date.toISOString().slice(0, 10) });
  }
  return rows;
}

async function seedUsers() {
  for (const user of DEMO_USERS) {
    const existing = await userModel.findByEmail(user.email);
    if (existing) {
      console.log(`  user ${user.email} already exists - skipped`);
      continue;
    }
    const passwordHash = await bcrypt.hash(user.password, 10);
    await userModel.create({ name: user.name, email: user.email, passwordHash, role: user.role });
    console.log(`  created ${user.role} account ${user.email}`);
  }
}

async function seedMedications() {
  const existing = await medicationModel.findAll();
  if (existing.length > 0) {
    console.log(`  medications table already has ${existing.length} rows - skipped`);
    return existing;
  }

  const created = [];
  let batchCount = 0;
  for (const { demand, batches, ...med } of DEMO_MEDICATIONS) {
    const medication = await medicationModel.create(med);
    for (const batch of batches) {
      await medicationBatchModel.create({ medication_id: medication.id, ...batch });
      batchCount += 1;
    }
    created.push(medication);
  }
  console.log(`  inserted ${created.length} medications across ${batchCount} stock batches`);
  return created;
}

async function seedSalesHistory(medications) {
  // Only the synthetic backfill is regenerated; sales recorded today through the
  // dispensing flow are real data and must survive a re-seed.
  const removed = await salesHistoryModel.deleteBefore(new Date().toISOString().slice(0, 10));
  console.log(`  cleared ${removed} synthetic history rows (real sales from today kept)`);

  let total = 0;
  for (const med of medications) {
    const template = DEMO_MEDICATIONS.find((d) => d.name === med.name);
    if (!template) continue; // medication added by staff, no demo pattern
    total += await salesHistoryModel.bulkInsert(generateSales(med.id, template.demand));
  }
  console.log(`  inserted ${total} sales_history rows`);
}

async function seed() {
  console.log('Seeding users...');
  await seedUsers();
  console.log('Seeding medications and stock batches...');
  const medications = await seedMedications();
  console.log('Seeding sales history...');
  await seedSalesHistory(medications);
}

seed()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exit(1);
  });
