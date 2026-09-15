/**
 * Seeds the database with demo accounts, a starter medication catalog and
 * synthetic historical sales for the forecasting model.
 * Safe to run repeatedly: existing accounts are kept, medications are only
 * inserted when the catalog is empty, and sales history is regenerated.
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
const salesHistoryModel = require('../models/salesHistoryModel');
const { ROLES } = require('../../../shared/constants.json');

const DEMO_USERS = [
  { name: 'Pharmacy Staff', email: 'staff@pharmacy.com', password: 'Staff123!', role: ROLES.STAFF },
  { name: 'Demo Patient', email: 'patient@example.com', password: 'Patient123!', role: ROLES.PATIENT },
];

/** Returns a YYYY-MM-DD date `days` days from today. */
function dateFromToday(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Catalog entries plus the synthetic demand pattern used for sales history:
 *   avgDaily  - average units sold per day
 *   trend     - change in daily demand over the whole history window
 *   days      - how many days of history to generate (short = insufficient data)
 */
const DEMO_MEDICATIONS = [
  { name: 'Paracetamol 500mg', category: 'Analgesic', quantity: 130, unit_price: 1.5, expiry_date: dateFromToday(400), supplier_info: 'Hikma Pharmaceuticals - +962 6 580 2900', demand: { avgDaily: 5, trend: 0, days: 90 } },
  { name: 'Ibuprofen 400mg', category: 'Analgesic', quantity: 80, unit_price: 2.25, expiry_date: dateFromToday(300), supplier_info: 'Dar Al Dawa - orders@dad.jo', demand: { avgDaily: 3, trend: 0, days: 90 } },
  // Clear declining-stock pattern: high and rising demand against a modest stock -> alert expected.
  { name: 'Amoxicillin 500mg', category: 'Antibiotic', quantity: 45, unit_price: 4.8, expiry_date: dateFromToday(200), supplier_info: 'Hikma Pharmaceuticals - +962 6 580 2900', demand: { avgDaily: 6, trend: 3, days: 90 } },
  { name: 'Azithromycin 250mg', category: 'Antibiotic', quantity: 25, unit_price: 6.5, expiry_date: dateFromToday(150), supplier_info: 'JOSWE Medical - sales@joswe.com', demand: { avgDaily: 1, trend: 0, days: 90 } },
  { name: 'Metformin 850mg', category: 'Antidiabetic', quantity: 60, unit_price: 3.1, expiry_date: dateFromToday(500), supplier_info: 'Dar Al Dawa - orders@dad.jo', demand: { avgDaily: 2, trend: 0, days: 90 } },
  { name: 'Amlodipine 5mg', category: 'Antihypertensive', quantity: 35, unit_price: 2.9, expiry_date: dateFromToday(20), supplier_info: 'Pharma International - +962 6 402 1000', demand: { avgDaily: 1, trend: 0, days: 90 } },
  { name: 'Omeprazole 20mg', category: 'Antacid', quantity: 0, unit_price: 3.75, expiry_date: dateFromToday(250), supplier_info: 'JOSWE Medical - sales@joswe.com', demand: { avgDaily: 2, trend: 0, days: 60 } },
  { name: 'Cetirizine 10mg', category: 'Antihistamine', quantity: 90, unit_price: 1.2, expiry_date: dateFromToday(365), supplier_info: 'Hikma Pharmaceuticals - +962 6 580 2900', demand: { avgDaily: 2, trend: 0, days: 90 } },
  // Small stock with steady demand -> alert expected within a few days.
  { name: 'Salbutamol Inhaler', category: 'Respiratory', quantity: 15, unit_price: 8.0, expiry_date: dateFromToday(180), supplier_info: 'Pharma International - +962 6 402 1000', demand: { avgDaily: 1.5, trend: 0, days: 90 } },
  // Newly stocked item with only a few days of sales -> insufficient data, no alert (UC-3 alt. flow).
  { name: 'Vitamin D3 1000IU', category: 'Supplement', quantity: 200, unit_price: 5.5, expiry_date: dateFromToday(600), supplier_info: 'Dar Al Dawa - orders@dad.jo', demand: { avgDaily: 4, trend: 0, days: 5 } },
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
  for (const { demand, ...med } of DEMO_MEDICATIONS) created.push(await medicationModel.create(med));
  console.log(`  inserted ${created.length} medications`);
  return created;
}

async function seedSalesHistory(medications) {
  await salesHistoryModel.deleteAll();
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
  console.log('Seeding medications...');
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
