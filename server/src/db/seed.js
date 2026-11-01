/**
 * Seeds the database with demo accounts, a starter medication catalog (held as
 * dated stock batches, see db/demoCatalog.js) and the sales history the
 * forecasting model learns from: daily sales from 1 January 2022 up to
 * yesterday, from data/demo-sales.json (see db/demoSales.js).
 *
 * Safe to run repeatedly: existing accounts are kept, medications are only
 * inserted when the catalog is empty, and only the history before today is
 * regenerated - real sales recorded today through the dispensing flow are
 * preserved.
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
const { DEMO_MEDICATIONS, sizeStock } = require('./demoCatalog');
const demoSales = require('./demoSales');
const { ROLES } = require('../../../shared/constants.json');

const DEMO_USERS = [
  { name: 'Pharmacy Staff', email: 'staff@pharmacy.com', password: 'Staff123!', role: ROLES.STAFF },
  // An obviously fictional number; patients must have one (GP2 addition).
  { name: 'Demo Patient', email: 'patient@example.com', phone: '+962790000000', password: 'Patient123!', role: ROLES.PATIENT },
];

/** Small deterministic pseudo-random generator so the seed is reproducible. */
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function yesterday() {
  return demoSales.addDays(new Date().toISOString().slice(0, 10), -1);
}

/** The demo pharmacy's daily sales of one series, from the first day of the data to yesterday. */
function seriesSales(medicationId, series) {
  return demoSales
    .datesBetween(demoSales.firstDay, yesterday())
    .map((date) => ({ medication_id: medicationId, quantity_sold: demoSales.unitsOn(series, date), date }))
    .filter((row) => row.quantity_sold !== null);
}

/** Generates daily sales rows for one medication without a series, ending yesterday. */
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
      // Accounts made before phone numbers existed get the demo number once.
      if (user.phone && !existing.phone) {
        await userModel.updatePhone(existing.id, user.phone);
        console.log(`  user ${user.email} already exists - added its phone number`);
      } else {
        console.log(`  user ${user.email} already exists - skipped`);
      }
      continue;
    }
    const passwordHash = await bcrypt.hash(user.password, 10);
    await userModel.create({ name: user.name, email: user.email, phone: user.phone, passwordHash, role: user.role });
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
  for (const template of DEMO_MEDICATIONS) {
    // Series-backed stock is sized from the last four weeks of demand.
    const { low_stock_threshold, batches } = template.series
      ? sizeStock(template, demoSales.recentAverage(template.series, yesterday()))
      : template;
    const { name, category, unit_price, supplier_info } = template;
    const medication = await medicationModel.create({ name, category, unit_price, supplier_info, low_stock_threshold });
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
  // Only the history before today is regenerated; sales recorded today through
  // the dispensing flow are real data and must survive a re-seed.
  const removed = await salesHistoryModel.deleteBefore(new Date().toISOString().slice(0, 10));
  console.log(`  cleared ${removed} history rows (real sales from today kept)`);

  let total = 0;
  for (const med of medications) {
    const template = DEMO_MEDICATIONS.find((d) => d.name === med.name);
    if (!template) continue; // medication added by staff, no demo pattern
    const rows = template.series ? seriesSales(med.id, template.series) : generateSales(med.id, template.demand);
    // In chunks: four years of daily rows is a large single INSERT.
    for (let i = 0; i < rows.length; i += 1000) {
      total += await salesHistoryModel.bulkInsert(rows.slice(i, i + 1000));
    }
  }
  console.log(`  inserted ${total} sales_history rows (${demoSales.firstDay} to ${yesterday()})`);
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
