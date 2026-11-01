// Fills the database with demo data:   npm run db:seed
//   1. two demo accounts (below);
//   2. the demo medication catalogue with its stock lots (db/demoCatalog.js);
//   3. the sales history the forecast learns from: daily sales from 1 January 2022 up to
//      yesterday, from data/demo-sales.json (db/demoSales.js).
//
// Safe to run again: existing accounts are kept, medications are only added when the
// catalogue is empty, and only the sales history BEFORE today is rebuilt - real sales made
// today on the Dispense page are kept.
//
// Demo accounts (password in brackets):
//   staff@pharmacy.com   (Staff123!)   - staff
//   patient@example.com  (Patient123!) - patient
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { ROLES } from '../constants.js';
import { todayAsText, addDaysToDate, listDatesBetween } from '../utils/dates.js';
import { DEMO_MEDICATIONS, sizeStock } from './demoCatalog.js';
import { DEMO_FIRST_DAY, getDemoUnits, getRecentAverage } from './demoSales.js';
import { insertSalesHistoryRows, deleteSalesHistoryBefore } from '../services/salesService.js';

const DEMO_USERS = [
  { name: 'Pharmacy Staff', email: 'staff@pharmacy.com', password: 'Staff123!', role: ROLES.STAFF },
  // An obviously fictional number; every patient must have one (GP2 addition)
  {
    name: 'Demo Patient',
    email: 'patient@example.com',
    phone: '+962790000000',
    password: 'Patient123!',
    role: ROLES.PATIENT,
  },
];

const yesterday = addDaysToDate(todayAsText(), -1);

// ----------------------------------------------------------------------------
// 1. Accounts
// ----------------------------------------------------------------------------

async function seedUsers() {
  for (const user of DEMO_USERS) {
    const [existing] = await db.query('SELECT id, phone FROM users WHERE email = ?', [user.email]);

    if (existing.length > 0) {
      // An older demo patient without a phone number gets the demo number once
      if (user.phone && !existing[0].phone) {
        await db.query('UPDATE users SET phone = ? WHERE id = ?', [user.phone, existing[0].id]);
        console.log(`  user ${user.email} already exists - added its phone number`);
      } else {
        console.log(`  user ${user.email} already exists - skipped`);
      }
      continue;
    }

    const passwordHash = await bcrypt.hash(user.password, 10);
    await db.query('INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)', [
      user.name,
      user.email,
      user.phone ?? null,
      passwordHash,
      user.role,
    ]);
    console.log(`  created ${user.role} account ${user.email}`);
  }
}

// ----------------------------------------------------------------------------
// 2. Medications and their stock lots
// ----------------------------------------------------------------------------

// Returns the medications in the database as [{ id, name }].
async function seedMedications() {
  const [existing] = await db.query('SELECT id, name FROM medications');
  if (existing.length > 0) {
    console.log(`  medications table already has ${existing.length} rows - skipped`);
    return existing;
  }

  let batchCount = 0;
  for (const medication of DEMO_MEDICATIONS) {
    // Medications with sales data get stock sized from their last 4 weeks of demand;
    // Vitamin D3 has fixed numbers in the catalogue
    let threshold = medication.low_stock_threshold;
    let batches = medication.batches;
    if (medication.series) {
      const sized = sizeStock(medication, getRecentAverage(medication.series, yesterday));
      threshold = sized.low_stock_threshold;
      batches = sized.batches;
    }

    const [result] = await db.query(
      `INSERT INTO medications (name, category, unit_price, supplier_info, low_stock_threshold)
       VALUES (?, ?, ?, ?, ?)`,
      [medication.name, medication.category, medication.unit_price, medication.supplier_info, threshold]
    );
    for (const batch of batches) {
      await db.query(
        `INSERT INTO medication_batches (medication_id, quantity, expiry_date, batch_number, received_date)
         VALUES (?, ?, ?, ?, ?)`,
        [result.insertId, batch.quantity, batch.expiry_date, batch.batch_number, batch.received_date]
      );
      batchCount += 1;
    }
  }
  console.log(`  inserted ${DEMO_MEDICATIONS.length} medications across ${batchCount} stock batches`);

  const [created] = await db.query('SELECT id, name FROM medications');
  return created;
}

// ----------------------------------------------------------------------------
// 3. Sales history
// ----------------------------------------------------------------------------

// Made-up daily sales for a medication with no series (Vitamin D3): `days` days ending yesterday.
// A fixed random sequence (seeded by the medication id) makes every seed give the same numbers.
function makeUpSales(medicationId, { avgDaily, trend, days }) {
  // A tiny random number generator: the same seed always gives the same sequence
  let state = (medicationId * 7919) >>> 0;
  function nextRandom() {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000; // a number between 0 and 1
  }

  const rows = [];
  for (let dayNumber = 0; dayNumber < days; dayNumber++) {
    const dateText = addDaysToDate(yesterday, dayNumber - days + 1);
    const progress = dayNumber / Math.max(days - 1, 1); // 0 on the first day, 1 on the last

    // Friday and Saturday are quieter in Jordan
    const weekday = new Date(`${dateText}T00:00:00Z`).getUTCDay();
    let weekendFactor = 1;
    if (weekday === 5) weekendFactor = 0.6;
    if (weekday === 6) weekendFactor = 0.8;

    const expected = (avgDaily - trend / 2 + trend * progress) * weekendFactor;
    const noise = (nextRandom() - 0.5) * avgDaily; // up to half the average either way
    rows.push({ medication_id: medicationId, quantity_sold: Math.max(0, Math.round(expected + noise)), date: dateText });
  }
  return rows;
}

async function seedSalesHistory(medications) {
  // Rebuild only the history before today: today's real sales stay
  const removedCount = await deleteSalesHistoryBefore(todayAsText());
  console.log(`  cleared ${removedCount} history rows (real sales from today kept)`);

  let insertedCount = 0;
  for (const medication of medications) {
    const template = DEMO_MEDICATIONS.find((demo) => demo.name === medication.name);
    if (!template) {
      continue; // added by staff: no demo history
    }

    let rows = [];
    if (template.series) {
      // One row per day from the first day of the data to yesterday
      for (const dateText of listDatesBetween(DEMO_FIRST_DAY, yesterday)) {
        const units = getDemoUnits(template.series, dateText);
        if (units !== null) {
          rows.push({ medication_id: medication.id, quantity_sold: units, date: dateText });
        }
      }
    } else {
      rows = makeUpSales(medication.id, template.demand);
    }
    insertedCount += await insertSalesHistoryRows(rows);
  }
  console.log(`  inserted ${insertedCount} sales_history rows (${DEMO_FIRST_DAY} to ${yesterday})`);
}

// ----------------------------------------------------------------------------
// Run the three steps
// ----------------------------------------------------------------------------

try {
  console.log('Seeding users...');
  await seedUsers();
  console.log('Seeding medications and stock batches...');
  const medications = await seedMedications();
  console.log('Seeding sales history...');
  await seedSalesHistory(medications);
} catch (error) {
  console.error('Seed failed:', error.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
